import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { PublicUser, UserRole } from '../types/coop.ts';
import { loadVaultState, type StoredUser } from './db.ts';
import { sanitizeRegisteredDevices } from './deviceAuthService.ts';

export const SESSION_COOKIE_NAME = 'amanah_session';

let warnedJwtSecret = false;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  if (!warnedJwtSecret && process.env.NODE_ENV === 'production') {
    warnedJwtSecret = true;
    console.warn(
      '[SECURITY] JWT_SECRET is missing or shorter than 16 characters in production! Configure a strong JWT_SECRET environment variable.'
    );
  }
  return secret || 'amanah-coop-jwt-dev-secret-2026-change-in-prod';
}

export interface AuthenticatedRequest extends Request {
  authUser?: PublicUser;
}

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  inAppAlerts: true,
  emailBallots: true,
  emailRepayments: true,
  emailCommunity: true,
  soundEnabled: false,
};

export function sanitizeUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    memberCode: user.memberCode,
    status: user.status,
    joinedAt: user.joinedAt,
    phoneMasked: user.phoneMasked,
    photoUrl: user.photoUrl,
    authProvider: 'password',
    communityMuted: Boolean(user.communityMuted),
    totpEnabled: Boolean(user.totpEnabled && user.encryptedTotpSecret),
    registeredDevices: sanitizeRegisteredDevices(user.registeredDevices),
    notificationPreferences: {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(user.notificationPreferences || {}),
    },
  };
}

export function signAuthToken(user: StoredUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export function signActivationChallengeToken(user: StoredUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      purpose: 'member_activation',
    },
    getJwtSecret(),
    { expiresIn: '30m' }
  );
}

export function verifyActivationChallengeToken(
  token: string
): { sub: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      sub?: string;
      email?: string;
      purpose?: string;
    };
    if (!decoded?.sub || !decoded?.email || decoded.purpose !== 'member_activation') {
      return null;
    }
    return { sub: decoded.sub, email: decoded.email };
  } catch {
    return null;
  }
}

export function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protoValues = Array.isArray(forwardedProto)
    ? forwardedProto.join(',')
    : String(forwardedProto || '');
  if (
    protoValues
      .split(',')
      .some((part) => part.trim().toLowerCase() === 'https')
  ) {
    return true;
  }
  if (String(req.headers['x-forwarded-ssl'] || '').trim().toLowerCase() === 'on') {
    return true;
  }
  const origin = String(req.headers.origin || '');
  const referer = String(req.headers.referer || '');
  return origin.startsWith('https://') || referer.startsWith('https://');
}

function parseRawCookieHeaderValues(cookieHeader: string | undefined, name: string): string[] {
  if (!cookieHeader) return [];
  const results: string[] = [];
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key !== name) continue;
    const rawVal = part.slice(eqIdx + 1).trim();
    if (!rawVal) continue;
    try {
      const decoded = decodeURIComponent(rawVal).trim();
      if (decoded) results.push(decoded);
    } catch {
      results.push(rawVal);
    }
  }
  return results;
}

export function extractSessionTokenCandidates(req: Request): string[] {
  const candidates: string[] = [];
  const pushUnique = (val: unknown) => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    }
  };

  // Prefer the explicit client-managed session header when present so a fresh login
  // cannot be shadowed by a stale/unpartitioned browser cookie in cross-site iframes.
  const headerRaw = req.headers?.['x-amanah-session'];
  const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  pushUnique(headerToken);

  pushUnique(req.cookies?.[SESSION_COOKIE_NAME]);
  for (const rawCookieVal of parseRawCookieHeaderValues(req.headers?.cookie, SESSION_COOKIE_NAME)) {
    pushUnique(rawCookieVal);
  }

  // Allow query token fallback strictly for SSE EventSource and direct browser file downloads
  // that cannot attach custom headers when third-party iframe cookies are blocked.
  if (req.path === '/events' || req.path.startsWith('/reports/')) {
    pushUnique(req.query?.sessionToken);
  }

  return candidates;
}

export function extractSessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  const headerRaw = req.headers['x-amanah-session'];
  const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  // Allow query token fallback strictly for SSE EventSource and direct browser file downloads
  // that cannot attach custom headers when third-party iframe cookies are blocked.
  if (req.path === '/events' || req.path.startsWith('/reports/')) {
    const queryToken = req.query?.sessionToken;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }
  }

  return null;
}

export function setAuthCookie(req: Request, res: Response, token: string): void {
  const isHttps = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
  });
}

function verifyCandidateJwtSub(candidates: string[]): string[] {
  const secret = getJwtSecret();
  const subs: string[] = [];
  for (const token of candidates) {
    try {
      const decoded = jwt.verify(token, secret) as { sub?: string };
      if (decoded?.sub && !subs.includes(decoded.sub)) {
        subs.push(decoded.sub);
      }
    } catch {
      // Try next candidate token (e.g., valid X-Amanah-Session after stale cookie)
    }
  }
  return subs;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const candidates = extractSessionTokenCandidates(req);
  if (candidates.length === 0) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const validSubs = verifyCandidateJwtSub(candidates);
  if (validSubs.length === 0) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  let state;
  try {
    state = await loadVaultState();
  } catch (err) {
    console.error('[Auth] Vault load error during session verification:', err);
    res.status(503).json({ error: 'Authentication service temporarily unavailable.' });
    return;
  }

  const user = validSubs
    .map((sub) => state.users.find((u) => u.id === sub && u.status === 'active'))
    .find(Boolean);

  if (!user) {
    res.status(401).json({ error: 'Account is inactive or not found.' });
    return;
  }

  req.authUser = sanitizeUser(user);
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({
        error: `Access denied. Requires one of: ${allowedRoles.join(', ')}.`,
      });
      return;
    }
    next();
  };
}

export async function resolveOptionalAuthUser(
  req: AuthenticatedRequest
): Promise<PublicUser | null> {
  if (req.authUser) return req.authUser;
  try {
    const candidates = extractSessionTokenCandidates(req);
    if (candidates.length === 0) return null;
    const validSubs = verifyCandidateJwtSub(candidates);
    if (validSubs.length === 0) return null;
    const state = await loadVaultState();
    const user = validSubs
      .map((sub) => state.users.find((u) => u.id === sub && u.status === 'active'))
      .find(Boolean);
    if (!user) return null;
    const sanitized = sanitizeUser(user);
    req.authUser = sanitized;
    return sanitized;
  } catch {
    return null;
  }
}
