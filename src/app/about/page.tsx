import type { Metadata } from 'next';
import { About } from '../../components/About.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';

export const metadata: Metadata = {
  title: 'About & Security Architecture — Amanah',
};

export default function AboutPage() {
  return (
    <PublicShell>
      <About />
    </PublicShell>
  );
}
