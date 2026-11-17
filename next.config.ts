import type { NextConfig } from 'next';

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
    'unpdf',
  ],
  outputFileTracingIncludes: {
    '/api/**': ['./firebase-applet-config.json'],
  },
};

export default nextConfig;
