import type { Metadata } from 'next';
import { PublicShell } from '../../components/PublicShell.tsx';
import { Rules } from '../../components/Rules.tsx';

export const metadata: Metadata = {
  title: 'Cooperative Rules & Shariah Charter — Amanah Co-op Treasury',
};

export default function RulesPage() {
  return (
    <PublicShell>
      <Rules />
    </PublicShell>
  );
}
