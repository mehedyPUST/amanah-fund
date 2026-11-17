import type { Metadata } from 'next';
import { FAQSection } from '../../components/FAQSection.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';
import { Rules } from '../../components/Rules.tsx';

export const metadata: Metadata = {
  title: 'Cooperative Rules & Shariah Charter — Amanah',
};

export default function RulesPage() {
  return (
    <PublicShell>
      <div className="space-y-5">
        <Rules />
        <FAQSection embedded />
      </div>
    </PublicShell>
  );
}
