import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans, Public_Sans } from 'next/font/google';
import Script from 'next/script';
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
    icon: '/pwa-192x192.png',
    apple: '/apple-touch-icon.png',
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${publicSans.variable} ${jetBrainsMono.variable}`}
    >
      <body className="amanah-ambient-canvas text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-600 selection:text-white">
        <Script id="amanah-theme-init" strategy="beforeInteractive">
          {`(function(){try{var saved=window.localStorage.getItem('amanah_theme');var prefersDark=saved==='dark'||(!saved&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(prefersDark){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`}
        </Script>
        <Script id="amanah-pwa-prompt-capture" strategy="beforeInteractive">
          {`(function(){if(typeof window==='undefined')return;window.__amanahInstallPrompt=window.__amanahInstallPrompt||null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__amanahInstallPrompt=e;window.dispatchEvent(new CustomEvent('amanah:pwa-prompt-updated'));});window.addEventListener('appinstalled',function(){window.__amanahInstallPrompt=null;window.__amanahAppInstalled=true;window.dispatchEvent(new CustomEvent('amanah:pwa-prompt-updated'));});})();`}
        </Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
