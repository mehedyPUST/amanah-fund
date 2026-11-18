import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import next from 'next';
import { initDatabase } from './src/server/db.ts';
import { processDueEmailQueue } from './src/server/emailQueueService.ts';
import {
  apiRouter,
  runMonthlyPdfSummaryJobIfDue,
  syncOverdueInstallments,
} from './src/server/routes.ts';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function startServer() {
  const dev = process.env.NODE_ENV !== 'production';
  const port = Number(process.env.PORT || 3000);

  const nextApp = next({ dev, hostname: '0.0.0.0', port });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();
  await initDatabase();
  void syncOverdueInstallments().catch((err) => {
    console.warn('[Scheduler] Initial overdue installment scan failed:', err);
  });
  void runMonthlyPdfSummaryJobIfDue().catch((err) => {
    console.warn('[Scheduler] Initial monthly PDF email check failed:', err);
  });

  const overdueTimer = setInterval(() => {
    syncOverdueInstallments().catch((err) => {
      console.warn('[Scheduler] Periodic overdue scan error:', err);
    });
    runMonthlyPdfSummaryJobIfDue().catch((err) => {
      console.warn('[Scheduler] Periodic monthly PDF email error:', err);
    });
  }, 15 * 60 * 1000);
  overdueTimer.unref();

  const initialEmailRetryTimer = setTimeout(() => {
    processDueEmailQueue().catch((err) => {
      console.warn('[EmailQueue] Startup retry sweep error:', err);
    });
  }, 15 * 1000);
  initialEmailRetryTimer.unref();

  const emailQueueTimer = setInterval(() => {
    processDueEmailQueue().catch((err) => {
      console.warn('[EmailQueue] Periodic retry sweep error:', err);
    });
  }, 60 * 1000);
  emailQueueTimer.unref();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((_req, res, nextFn) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    nextFn();
  });

  // Mount Express API routes (JSON + Cookies + SSE) before Next.js request handler
  app.use('/api', express.json({ limit: '16mb' }), cookieParser(), apiRouter);

  app.use(
    (
      err: Error & { name?: string },
      req: express.Request,
      res: express.Response,
      nextFn: express.NextFunction
    ) => {
      if (
        err &&
        (err.name === 'MongooseError' ||
          err.name === 'MongoNetworkError' ||
          err.name === 'MongoServerSelectionError' ||
          err.message?.includes('buffering timed out'))
      ) {
        console.warn('[AI Studio] Database offline — returning fallback response');
        if (req.method === 'GET') {
          return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
        }
        return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
      }
      nextFn(err);
    }
  );

  app.get('/favicon.ico', (_req, res) => {
    res.sendFile('favicon.ico', { root: 'public' });
  });

  // Delegate all Next.js App Router pages, assets, and RSC requests to Next.js
  app.all(/.*/, (req, res) => {
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
