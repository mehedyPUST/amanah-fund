import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import next from 'next';
import { initDatabase } from './src/server/db.ts';
import { apiRouter } from './src/server/routes.ts';

async function startServer() {
  const dev = process.env.NODE_ENV !== 'production';
  const port = Number(process.env.PORT || 3000);

  const nextApp = next({ dev, hostname: '0.0.0.0', port });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();
  await initDatabase();

  const app = express();
  app.set('trust proxy', 1);

  // Mount Express API routes (JSON + Cookies + SSE) before Next.js request handler
  app.use('/api', express.json({ limit: '12mb' }), cookieParser(), apiRouter);

  // Delegate all Next.js App Router pages, assets, and RSC requests to Next.js
  app.all('*', (req, res) => {
    return handle(req, res);
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(
      `Amanah Co-op Treasury (Next.js + Express) listening on http://0.0.0.0:${port} [${dev ? 'dev' : 'prod'}]`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
