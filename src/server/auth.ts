import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { PublicUser, UserRole } from '../types/coop.ts';
import { loadVaultState, type StoredUser } from './db.ts';

export const SESSION_COOKIE_NAME = 'amanah_session';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedGoogleCerts: Record<string, string> = {};
let cachedGoogleCertsExpiry = 0;

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

function getFirebaseProjectId(): string {
  const envId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (envId) return envId;

  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as { projectId?: string };
  if (!parsed.projectId) {
    throw new Error('Firebase projectId is missing in firebase-applet-config.json.');
  }
  return parsed.projectId;
}

async function getGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedGoogleCertsExpiry > now && Object.keys(cachedGoogleCerts).length > 0) {
    return cachedGoogleCerts;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google verification certificates (${res.status}).`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  cachedGoogleCerts = certs;
  cachedGoogleCertsExpiry = now + Math.max(60, maxAgeSeconds) * 1000;
  return certs;
}

export interface VerifiedGoogleIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

export async function verifyFirebaseGoogleIdToken(
  idToken: string
): Promise<VerifiedGoogleIdentity> {
  const projectId = getFirebaseProjectId();
  const decodedHeader = jwt.decode(idToken, { complete: true }) as
    | { header?: { kid?: string; alg?: string } }
    | null;

  const kid = decodedHeader?.header?.kid;
  const alg = decodedHeader?.header?.alg;
  if (!kid || alg !== 'RS256') {
    throw new Error('Invalid Google ID token header.');
  }

  let certs = await getGooglePublicCerts(false);
  if (!certs[kid]) {
    certs = await getGooglePublicCerts(true);
  }
  const certPem = certs[kid];
  if (!certPem) {
    throw new Error('Google verification certificate not found for token.');
  }

  const payload = jwt.verify(idToken, certPem, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  }) as jwt.JwtPayload & {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    auth_time?: number;
  };

  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Invalid Google user subject identifier.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.auth_time === 'number' && payload.auth_time > nowSeconds + 300) {
    throw new Error('Invalid Google authentication timestamp.');
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Google account did not provide an email address.');
  }

  return {
    uid: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    name: String(payload.name || '').trim(),
    picture: typeof payload.picture === 'string' ? payload.picture.trim() : undefined,
  };
}

export function signGoogleRegistrationToken(identity: VerifiedGoogleIdentity): string {
  return jwt.sign(
    {
      purpose: 'google_kyc_onboarding',
      uid: identity.uid,
      email: identity.email,
      name: identity.name,
      picture: identity.picture || '',
    },
    getJwtSecret(),
    { expiresIn: '20m' }
  );
}

export function verifyGoogleRegistrationToken(token: string): VerifiedGoogleIdentity {
  const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & {
    purpose?: string;
    uid?: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (
    decoded.purpose !== 'google_kyc_onboarding' ||
    !decoded.uid ||
    !decoded.email
  ) {
    throw new Error('Invalid or expired Google onboarding session. Please verify with Google again.');
  }

  return {
    uid: decoded.uid,
    email: decoded.email.toLowerCase(),
    emailVerified: true,
    name: String(decoded.name || '').trim(),
    picture: decoded.picture || undefined,
  };
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
  const authProvider =
    user.authProvider ||
    (user.googleUid && user.passwordHash
      ? 'both'
      : user.googleUid
        ? 'google'
        : 'password');

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
    authProvider,
    communityMuted: Boolean(user.communityMuted),
    totpEnabled: Boolean(user.totpEnabled && user.encryptedTotpSecret),
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
