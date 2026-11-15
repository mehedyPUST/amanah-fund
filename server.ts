import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import next from 'next';
import { initDatabase } from './src/server/db.ts';
import { apiRouter, syncOverdueInstallments } from './src/server/routes.ts';

async function startServer() {
  const dev = process.env.NODE_ENV !== 'production';
  const port = Number(process.env.PORT || 3000);

  const nextApp = next({ dev, hostname: '0.0.0.0', port });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();
  await initDatabase();
  await syncOverdueInstallments().catch((err) => {
    console.warn('[Scheduler] Initial overdue installment scan failed:', err);
  });

  const overdueTimer = setInterval(() => {
    syncOverdueInstallments().catch((err) => {
      console.warn('[Scheduler] Periodic overdue scan error:', err);
    });
  }, 15 * 60 * 1000);
  overdueTimer.unref();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((_req, res, nextFn) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    nextFn();
  });

  // Mount Express API routes (JSON + Cookies + SSE) before Next.js request handler
  app.use('/api', express.json({ limit: '12mb' }), cookieParser(), apiRouter);

  app.get('/favicon.ico', (_req, res) => {
    res.redirect(307, '/icon');
  });

  // Delegate all Next.js App Router pages, assets, and RSC requests to Next.js
  app.all('*', (req, res) => {
    return handle(req, res);
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(
      `Amanah Co-op Treasury (Next.js + Express) listening on http://0.0.0.0:${port} (Local: http://localhost:${port}) [${dev ? 'dev' : 'prod'}]`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
