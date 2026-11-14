import { PublicHomeView } from '../components/PublicHomeView.tsx';
import { PublicShell } from '../components/PublicShell.tsx';

export default function HomePage() {
  return (
    <PublicShell>
      <PublicHomeView />
    </PublicShell>
  );
}
