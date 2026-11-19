import type { Metadata, Viewport } from 'next';
import { Anek_Bangla, Inter, Open_Sans, Space_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppProviders } from '../components/AppProviders.tsx';
import { normalizeLocale } from '../i18n/config.ts';
import { getServerSessionUser } from '../server/ssrData.ts';
import './globals.css';

const interHeading = Inter({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const openSansBody = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
});

const anekBangla = Anek_Bangla({
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bangla',
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#059669' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export const metadata: Metadata = {
  title: 'Amanah — Qard Hasan & Halal Fund Management',
  description:
    'Encrypted cooperative fund management platform for monthly contributions, 2/3 member-voted Qard Hasan interest-free loans, and post-maturity Halal project investment.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon-32x32.png',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Amanah',
  },
  openGraph: {
    title: 'Amanah — Qard Hasan & Halal Fund Management',
    description:
      'Encrypted cooperative fund management platform for monthly contributions, 2/3 member-voted Qard Hasan interest-free loans, and post-maturity Halal project investment.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [rawLocale, initialUser, cookieStore] = await Promise.all([
    getLocale(),
    getServerSessionUser(),
    cookies(),
  ]);
  const locale = normalizeLocale(rawLocale);
  const hasVisitedBefore = cookieStore.get('amanah_visited')?.value === '1';

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${interHeading.variable} ${openSansBody.variable} ${spaceMono.variable} ${anekBangla.variable}`}
    >
      <body className="amanah-ambient-canvas text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-600 selection:text-white">
        <AppProviders
          initialLocale={locale}
          initialUser={initialUser}
          initialVisited={hasVisitedBefore}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
