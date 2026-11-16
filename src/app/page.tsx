import { HomeWorkspace } from '../components/HomeWorkspace.tsx';
import { PublicShell } from '../components/PublicShell.tsx';

export default function HomePage() {
  return (
    <PublicShell>
      <HomeWorkspace />
    </PublicShell>
  );
}
