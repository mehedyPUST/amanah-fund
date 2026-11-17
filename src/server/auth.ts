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

export function setAuthCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
  });
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as { sub?: string };
    if (!decoded?.sub) {
      res.status(401).json({ error: 'Invalid session token.' });
      return;
    }

    const state = await loadVaultState();
    const user = state.users.find((u) => u.id === decoded.sub);
    if (!user || user.status !== 'active') {
      res.status(401).json({ error: 'Account is inactive or not found.' });
      return;
    }

    req.authUser = sanitizeUser(user);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
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
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;
    const decoded = jwt.verify(token, getJwtSecret()) as { sub?: string };
    if (!decoded?.sub) return null;
    const state = await loadVaultState();
    const user = state.users.find((u) => u.id === decoded.sub);
    if (!user || user.status !== 'active') return null;
    const sanitized = sanitizeUser(user);
    req.authUser = sanitized;
    return sanitized;
  } catch {
    return null;
  }
}
