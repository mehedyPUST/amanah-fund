import type { Metadata } from 'next';
import { DashboardShell } from '../../components/DashboardShell.tsx';

export const metadata: Metadata = {
  title: 'Members Dashboard — Amanah Co-op Treasury',
};

export default function DashboardPage() {
  return <DashboardShell />;
}
