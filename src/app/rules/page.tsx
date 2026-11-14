import type { Metadata } from 'next';
import { PublicRulesView } from '../../components/PublicRulesView.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';

export const metadata: Metadata = {
  title: 'Cooperative Rules & Shariah Charter — Amanah Co-op Treasury',
};

export default function RulesPage() {
  return (
    <PublicShell>
      <PublicRulesView />
    </PublicShell>
  );
}
