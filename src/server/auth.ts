import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { PublicUser, UserRole } from '../types/coop.ts';
import { sanitizeMobileMemberOverviewIcons } from '../utils/mobileOverviewTiles.ts';
import {
  findActiveUserByIds,
  findRevokedTokenIds,
  revokeSessionTokens,
  type StoredUser,
} from './db.ts';
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
  pushAlerts: true,
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
    ...(user.mobileOverviewIcons
      ? {
          mobileOverviewIcons: sanitizeMobileMemberOverviewIcons(user.mobileOverviewIcons, {
            allowManagerTiles: user.role === 'manager' || user.role === 'admin',
            allowAdminTiles: user.role === 'admin',
          }),
        }
      : {}),
    ...(user.themePreference === 'light' || user.themePreference === 'dark'
      ? { themePreference: user.themePreference }
      : {}),
  };
}

export function computeTokenRevocationId(token: string, decodedJti?: string): string {
  const cleanJti = typeof decodedJti === 'string' ? decodedJti.trim() : '';
  if (cleanJti) return `jti:${cleanJti}`;
  const digest = crypto.createHash('sha256').update(token.trim()).digest('hex').slice(0, 40);
  return `sha:${digest}`;
}

export function signAuthToken(user: StoredUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: '7d', jwtid: crypto.randomUUID() }
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
  // Primary variant matching setAuthCookie (kept first for predictable Set-Cookie ordering)
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
    maxAge: 0,
  });

  // Also expire alternate cookie-jar attribute variants (unpartitioned, SameSite=Lax, non-Secure)
  // so legacy or cross-partition amanah_session cookies can never survive sign-out.
  if (isHttps) {
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 0,
    });
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  } else {
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
      maxAge: 0,
    });
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 0,
    });
  }
}

interface VerifiedSessionCandidate {
  sub: string;
  tokenId: string;
  expiresAt: string;
}

function decodeValidSessionCandidates(candidates: string[]): VerifiedSessionCandidate[] {
  const secret = getJwtSecret();
  const decodedList: VerifiedSessionCandidate[] = [];
  const seenTokenIds = new Set<string>();
  for (const rawToken of candidates) {
    const token = rawToken.trim();
    if (!token) continue;
    try {
      const decoded = jwt.verify(token, secret) as {
        sub?: string;
        jti?: string;
        exp?: number;
        purpose?: string;
      };
      // Reject non-session challenge tokens (e.g., member activation challenge JWT)
      if (!decoded?.sub || decoded.purpose) continue;
      const tokenId = computeTokenRevocationId(token, decoded.jti);
      if (seenTokenIds.has(tokenId)) continue;
      seenTokenIds.add(tokenId);
      const expiresAt =
        typeof decoded.exp === 'number' && Number.isFinite(decoded.exp)
          ? new Date(decoded.exp * 1000).toISOString()
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      decodedList.push({ sub: decoded.sub, tokenId, expiresAt });
    } catch {
      // Try next candidate token (e.g., valid X-Amanah-Session after stale cookie)
    }
  }
  return decodedList;
}

async function verifyCandidateJwtSub(candidates: string[]): Promise<string[]> {
  const decodedList = decodeValidSessionCandidates(candidates);
  if (decodedList.length === 0) return [];

  const revokedIds = await findRevokedTokenIds(decodedList.map((item) => item.tokenId));
  const subs: string[] = [];
  for (const item of decodedList) {
    if (revokedIds.has(item.tokenId)) continue;
    if (!subs.includes(item.sub)) {
      subs.push(item.sub);
    }
  }
  return subs;
}

/** Revoke all valid session tokens presented on a logout request (cookies, header, and optional body). */
export async function revokeRequestSessions(
  req: Request,
  extraTokens: string[] = []
): Promise<number> {
  const candidates = [...extractSessionTokenCandidates(req)];
  for (const extra of extraTokens) {
    if (typeof extra === 'string' && extra.trim() && !candidates.includes(extra.trim())) {
      candidates.push(extra.trim());
    }
  }
  const queryToken = req.query?.sessionToken;
  if (typeof queryToken === 'string' && queryToken.trim() && !candidates.includes(queryToken.trim())) {
    candidates.push(queryToken.trim());
  }

  const decodedList = decodeValidSessionCandidates(candidates);
  if (decodedList.length === 0) return 0;

  await revokeSessionTokens(
    decodedList.map((item) => ({
      id: item.tokenId,
      userId: item.sub,
      expiresAt: item.expiresAt,
    }))
  );
  return decodedList.length;
}

export async function verifySessionTokensToUser(
  tokens: Array<string | undefined | null>
): Promise<PublicUser | null> {
  const cleanTokens = tokens
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim());
  if (cleanTokens.length === 0) return null;
  const validSubs = await verifyCandidateJwtSub(cleanTokens);
  if (validSubs.length === 0) return null;
  try {
    const user = await findActiveUserByIds(validSubs);
    return user ? sanitizeUser(user) : null;
  } catch {
    return null;
  }
}

export async function verifySessionTokenToUser(
  token: string | undefined | null
): Promise<PublicUser | null> {
  return verifySessionTokensToUser([token]);
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

  const validSubs = await verifyCandidateJwtSub(candidates);
  if (validSubs.length === 0) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  let user: StoredUser | null;
  try {
    user = await findActiveUserByIds(validSubs);
  } catch (err) {
    console.error('[Auth] User lookup error during session verification:', err);
    res.status(503).json({ error: 'Authentication service temporarily unavailable.' });
    return;
  }

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
    const validSubs = await verifyCandidateJwtSub(candidates);
    if (validSubs.length === 0) return null;
    const user = await findActiveUserByIds(validSubs);
    if (!user) return null;
    const sanitized = sanitizeUser(user);
    req.authUser = sanitized;
    return sanitized;
  } catch {
    return null;
  }
}
