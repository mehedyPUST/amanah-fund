import type { Metadata } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans, Public_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProviders } from '../components/AppProviders.tsx';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Amanah Co-op Treasury — Qard Hasan & Halal Fund Management',
  description:
    'Encrypted cooperative fund management platform for monthly contributions, 2/3 member-voted Qard Hasan interest-free loans, and post-maturity Halal project investment.',
  openGraph: {
    title: 'Amanah Co-op Treasury — Qard Hasan & Halal Fund Management',
    description:
      'Encrypted cooperative fund management platform for monthly contributions, 2/3 member-voted Qard Hasan interest-free loans, and post-maturity Halal project investment.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${publicSans.variable} ${jetBrainsMono.variable}`}
    >
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-600 selection:text-white">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
