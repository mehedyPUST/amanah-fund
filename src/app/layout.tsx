import type { Metadata, Viewport } from 'next';
import { Anek_Bangla, DM_Sans, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppProviders } from '../components/AppProviders.tsx';
import { normalizeLocale } from '../i18n/config.ts';
import { getServerSessionUser } from '../server/ssrData.ts';
import './globals.css';

const displayHeading = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
});

const bodySans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

const anekBangla = Anek_Bangla({
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bangla',
});

export const viewport: Viewport = {
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#059669' },
    { media: '(prefers-color-scheme: dark)', color: '#001E2B' },
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
  const themeCookie = cookieStore.get('amanah_theme')?.value;
  const initialTheme =
    themeCookie === 'dark' || themeCookie === 'light'
      ? themeCookie
      : initialUser?.themePreference === 'dark' || initialUser?.themePreference === 'light'
        ? initialUser.themePreference
        : null;

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${displayHeading.variable} ${bodySans.variable} ${jetbrainsMono.variable} ${anekBangla.variable}${initialTheme === 'dark' ? ' dark' : ''}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var m=document.cookie.match(/(?:^|; )amanah_theme=([^;]+)/);var c=m?decodeURIComponent(m[1]):null;var s=null;try{s=localStorage.getItem('amanah_theme');}catch(e){}var t=(c==='dark'||c==='light')?c:(s==='dark'||s==='light')?s:null;if(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches){t='dark';}if(t==='dark'){d.classList.add('dark');}else if(t==='light'){d.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="amanah-ambient-canvas text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-600 selection:text-white">
        <AppProviders
          initialLocale={locale}
          initialUser={initialUser}
          initialVisited={hasVisitedBefore}
          initialTheme={initialTheme}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
