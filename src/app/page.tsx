import { Hero } from '../components/Hero.tsx';
import { PublicShell } from '../components/PublicShell.tsx';

export default function HomePage() {
  return (
    <PublicShell>
      <Hero />
    </PublicShell>
  );
}
