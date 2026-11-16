import { About } from '../components/About.tsx';
import { Hero, HeroLifecycle } from '../components/Hero.tsx';
import { HomeCommunitySection } from '../components/HomeCommunitySection.tsx';
import { HomeNoticeBoardSection } from '../components/HomeNoticeBoardSection.tsx';
import { HowItWorks } from '../components/HowItWorks.tsx';
import { PublicShell } from '../components/PublicShell.tsx';
import { Rules } from '../components/Rules.tsx';

export default function HomePage() {
  return (
    <PublicShell>
      <div className="space-y-2.5">
        <section id="overview" className="scroll-mt-[76px]">
          <Hero includeLifecycle={false} embedded />
        </section>

        <HomeNoticeBoardSection embedded />

        <section id="community" className="scroll-mt-[76px]">
          <HomeCommunitySection embedded />
        </section>

        <HeroLifecycle embedded />

        <section id="architecture" className="scroll-mt-[76px]">
          <About embedded />
        </section>

        <section id="how-it-works" className="scroll-mt-[76px]">
          <HowItWorks embedded />
        </section>

        <section id="governance-charter" className="scroll-mt-[76px]">
          <Rules embedded />
        </section>
      </div>
    </PublicShell>
  );
}
