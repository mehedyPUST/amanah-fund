import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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

export default nextConfig;
