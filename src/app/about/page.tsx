import type { Metadata } from 'next';
import { PublicAboutView } from '../../components/PublicAboutView.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';

export const metadata: Metadata = {
  title: 'About & Security Architecture — Amanah Co-op Treasury',
};

export default function AboutPage() {
  return (
    <PublicShell>
      <PublicAboutView />
    </PublicShell>
  );
}
