import type { NextFunction, Request, Response } from 'express';

interface RateLimitBucket {
  timestamps: number[];
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message?: string;
}) {
  const buckets = new Map<string, RateLimitBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const ip =
      req.ip ||
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : 'unknown');
    const key = `${options.keyPrefix}:${ip}`;

    const existing = buckets.get(key) || { timestamps: [] };
    existing.timestamps = existing.timestamps.filter((ts) => ts > cutoff);

    if (existing.timestamps.length >= options.maxRequests) {
      const oldest = existing.timestamps[0] || now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error:
          options.message ||
          `Too many requests. Please wait ${retryAfterSeconds} seconds before trying again.`,
      });
      return;
    }

    existing.timestamps.push(now);
    buckets.set(key, existing);

    // Opportunistic cleanup so memory stays bounded
    if (buckets.size > 2000) {
      for (const [k, b] of buckets.entries()) {
        b.timestamps = b.timestamps.filter((ts) => ts > cutoff);
        if (b.timestamps.length === 0) {
          buckets.delete(k);
        }
      }
    }

    next();
  };
}
