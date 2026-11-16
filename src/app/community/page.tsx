import type { Metadata } from 'next';
import { HomeCommunitySection } from '../../components/HomeCommunitySection.tsx';
import { HomeNoticeBoardSection } from '../../components/HomeNoticeBoardSection.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';

export const metadata: Metadata = {
  title: 'Cooperative Community Hub — Amanah',
};

export default function CommunityPage() {
  return (
    <PublicShell>
      <div className="space-y-2.5">
        <HomeNoticeBoardSection embedded />
        <HomeCommunitySection embedded />
      </div>
    </PublicShell>
  );
}
