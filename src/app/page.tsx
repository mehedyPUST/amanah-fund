import { About } from '../components/About.tsx';
import { Hero } from '../components/Hero.tsx';
import { HomeCommunitySection } from '../components/HomeCommunitySection.tsx';
import { PublicShell } from '../components/PublicShell.tsx';
import { Rules } from '../components/Rules.tsx';

export default function HomePage() {
  return (
    <PublicShell>
      <section id="overview" className="scroll-mt-16">
        <Hero />
      </section>
      <section
        id="architecture"
        className="scroll-mt-16 border-t border-slate-200/80 dark:border-slate-800/80"
      >
        <About embedded />
      </section>
      <section
        id="governance-charter"
        className="scroll-mt-16 border-t border-slate-200/80 dark:border-slate-800/80"
      >
        <Rules embedded />
      </section>
      <section
        id="community"
        className="scroll-mt-16 border-t border-slate-200/80 dark:border-slate-800/80"
      >
        <HomeCommunitySection />
      </section>
    </PublicShell>
  );
}
