import http from 'node:http';
import { Socket } from 'node:net';
import cookieParser from 'cookie-parser';
import express from 'express';
import { initDatabase } from './db.ts';
import { apiRouter, syncOverdueInstallments } from './routes.ts';

let cachedExpressApp: express.Express | null = null;
let lastOverdueSyncAt = 0;

function getExpressApp(): express.Express {
  if (cachedExpressApp) return cachedExpressApp;
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use('/api', express.json({ limit: '16mb' }), cookieParser(), apiRouter);
  cachedExpressApp = app;
  return app;
}

function buildWebHeaders(nodeRes: http.ServerResponse): Headers {
  const headers = new Headers();
  const rawHeaders = nodeRes.getHeaders();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, String(item));
      }
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

export async function handleVercelApiRequest(request: Request): Promise<Response> {
  await initDatabase();

  const now = Date.now();
  if (now - lastOverdueSyncAt > 15 * 60 * 1000) {
    lastOverdueSyncAt = now;
    void syncOverdueInstallments().catch((err) => {
      console.warn('[Scheduler] Overdue installment sync failed:', err);
    });
  }

  const app = getExpressApp();
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const bodyBuffer = hasBody ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);

  const rawHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    rawHeaders[key.toLowerCase()] = value;
  });
  if (hasBody) {
    rawHeaders['content-length'] = String(bodyBuffer.length);
    delete rawHeaders['transfer-encoding'];
  }

  const socket = new Socket();
  const forwardedHttps = String(rawHeaders['x-forwarded-proto'] || '')
    .split(',')
    .some((part) => part.trim().toLowerCase() === 'https');
  if (url.protocol === 'https:' || forwardedHttps) {
    Object.defineProperty(socket, 'encrypted', { value: true, configurable: true });
  }
  if (rawHeaders['x-forwarded-for']) {
    const remoteIp = rawHeaders['x-forwarded-for'].split(',')[0]?.trim();
    if (remoteIp) {
      Object.defineProperty(socket, 'remoteAddress', { value: remoteIp, configurable: true });
    }
  }

  const req = new http.IncomingMessage(socket);
  req.method = method;
  req.url = `${url.pathname}${url.search}`;
  req.headers = rawHeaders;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;

  if (bodyBuffer.length > 0) {
    req.push(bodyBuffer);
  }
  req.push(null);

  const res = new http.ServerResponse(req);

  return new Promise<Response>((resolve) => {
    let settled = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const bufferedChunks: Uint8Array[] = [];

    const toUint8Array = (chunk: unknown, encoding?: BufferEncoding): Uint8Array => {
      if (chunk instanceof Uint8Array) return chunk;
      if (typeof chunk === 'string') return Buffer.from(chunk, encoding || 'utf8');
      return Buffer.from(String(chunk));
    };

    const resolveAsStreamIfNeeded = () => {
      if (settled) return;
      settled = true;
      const status = res.statusCode || 200;
      const headers = buildWebHeaders(res);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          for (const chunk of bufferedChunks) {
            controller.enqueue(chunk);
          }
          bufferedChunks.length = 0;
        },
        cancel() {
          res.emit('close');
          res.destroy();
        },
      });
      resolve(new Response(stream, { status, statusText: res.statusMessage, headers }));
    };

    res.writeHead = function (
      statusCode: number,
      reasonOrHeaders?: string | http.OutgoingHttpHeaders | http.OutgoingHttpHeader[],
      maybeHeaders?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]
    ) {
      res.statusCode = statusCode;
      let headersObj = maybeHeaders;
      if (typeof reasonOrHeaders === 'string') {
        res.statusMessage = reasonOrHeaders;
      } else if (reasonOrHeaders) {
        headersObj = reasonOrHeaders;
      }
      if (headersObj && !Array.isArray(headersObj)) {
        for (const [k, v] of Object.entries(headersObj)) {
          if (v !== undefined) res.setHeader(k, v);
        }
      }
      return res;
    } as typeof res.writeHead;

    res.flushHeaders = function () {
      const contentType = String(res.getHeader('content-type') || '');
      if (contentType.includes('text/event-stream')) {
        resolveAsStreamIfNeeded();
      }
    };

    res.write = function (
      chunk: unknown,
      encodingOrCb?: BufferEncoding | ((error: Error | null | undefined) => void),
      cb?: (error: Error | null | undefined) => void
    ): boolean {
      const encoding = typeof encodingOrCb === 'string' ? encodingOrCb : undefined;
      const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
      if (chunk !== undefined && chunk !== null) {
        const bytes = toUint8Array(chunk, encoding);
        if (streamController) {
          try {
            streamController.enqueue(bytes);
          } catch {
            // stream closed
          }
        } else {
          bufferedChunks.push(bytes);
        }
      }
      const contentType = String(res.getHeader('content-type') || '');
      if (!settled && contentType.includes('text/event-stream')) {
        resolveAsStreamIfNeeded();
      }
      callback?.(null);
      return true;
    } as typeof res.write;

    res.end = function (
      chunkOrCb?: unknown,
      encodingOrCb?: BufferEncoding | (() => void),
      cb?: () => void
    ) {
      let chunk: unknown = chunkOrCb;
      let encoding: BufferEncoding | undefined;
      let callback: (() => void) | undefined = cb;

      if (typeof chunkOrCb === 'function') {
        callback = chunkOrCb as () => void;
        chunk = undefined;
      } else if (typeof encodingOrCb === 'function') {
        callback = encodingOrCb;
      } else if (typeof encodingOrCb === 'string') {
        encoding = encodingOrCb;
      }

      if (chunk !== undefined && chunk !== null) {
        const bytes = toUint8Array(chunk, encoding);
        if (streamController) {
          try {
            streamController.enqueue(bytes);
          } catch {
            // stream closed
          }
        } else {
          bufferedChunks.push(bytes);
        }
      }

      Object.defineProperty(res, 'writableEnded', { value: true, configurable: true });
      Object.defineProperty(res, 'finished', { value: true, configurable: true });

      if (streamController) {
        try {
          streamController.close();
        } catch {
          // already closed
        }
      } else if (!settled) {
        settled = true;
        const status = res.statusCode || 200;
        const headers = buildWebHeaders(res);
        const body =
          status === 204 || status === 304 || method === 'HEAD'
            ? null
            : Buffer.concat(bufferedChunks);
        resolve(new Response(body, { status, statusText: res.statusMessage, headers }));
      }

      res.emit('finish');
      callback?.();
      return res;
    } as typeof res.end;

    request.signal?.addEventListener('abort', () => {
      res.emit('close');
      res.destroy();
    });

    app(req as unknown as express.Request, res as unknown as express.Response, () => {
      if (!settled) {
        settled = true;
        resolve(
          new Response(JSON.stringify({ error: 'API route not found.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
    });
  });
}
