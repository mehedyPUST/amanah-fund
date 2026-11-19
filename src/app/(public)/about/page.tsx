import type { Metadata } from 'next';
import { About } from '../../../components/About.tsx';

export const metadata: Metadata = {
  title: 'About & Security Architecture — Amanah',
};

export default function AboutPage() {
  return <About />;
}
