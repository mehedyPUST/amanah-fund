import type { Metadata } from 'next';
import { About } from '../../components/About.tsx';
import { FAQSection } from '../../components/FAQSection.tsx';
import { HeroLifecycle } from '../../components/Hero.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';

export const metadata: Metadata = {
  title: 'About & Security Architecture — Amanah',
};

export default function AboutPage() {
  return (
    <PublicShell>
      <div className="space-y-8 sm:space-y-10">
        <About />
        <HeroLifecycle embedded />
        <FAQSection embedded={false} />
      </div>
    </PublicShell>
  );
}
