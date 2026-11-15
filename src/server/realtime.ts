import type { Response } from 'express';

interface SseClient {
  id: string;
  userId: string;
  res: Response;
}

const clients = new Map<string, SseClient>();

export function registerSseClient(userId: string, res: Response): string {
  const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

  clients.set(clientId, { id: clientId, userId, res });

  const heartbeat = setInterval(() => {
    if (!clients.has(clientId) || res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      clients.delete(clientId);
      return;
    }
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(clientId);
    }
  }, 25000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });

  return clientId;
}

export function broadcastRealtimeEvent(event: string, payload: Record<string, unknown>): void {
  const serialized = `event: ${event}\ndata: ${JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString(),
  })}\n\n`;

  for (const client of clients.values()) {
    if (client.res.writableEnded || client.res.destroyed) {
      clients.delete(client.id);
      continue;
    }
    try {
      client.res.write(serialized);
    } catch {
      clients.delete(client.id);
    }
  }
}

export function sendRealtimeEventToUsers(
  userIds: string[],
  event: string,
  payload: Record<string, unknown>
): void {
  const targetSet = new Set(userIds);
  const serialized = `event: ${event}\ndata: ${JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString(),
  })}\n\n`;

  for (const client of clients.values()) {
    if (!targetSet.has(client.userId)) continue;
    if (client.res.writableEnded || client.res.destroyed) {
      clients.delete(client.id);
      continue;
    }
    try {
      client.res.write(serialized);
    } catch {
      clients.delete(client.id);
    }
  }
}

