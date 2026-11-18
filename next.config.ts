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
};

export default withNextIntl(nextConfig);

