import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '*.asia-northeast1.run.app',
    '*.run.app',
    'localhost',
  ],
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [
    'mongodb',
    'bcryptjs',
    'express',
    'jsonwebtoken',
    'qrcode',
    'cookie-parser',
    'nodemailer',
    'jspdf',
  ],
  outputFileTracingIncludes: {
    '/api/**': ['./firebase-applet-config.json'],
  },
  async headers() {
    const noStoreHeaders = [
      { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
      { key: 'Pragma', value: 'no-cache' },
    ];
    return [
      {
        source: '/dashboard',
        headers: noStoreHeaders,
      },
      {
        source: '/dashboard/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/api/auth/:path*',
        headers: noStoreHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);

