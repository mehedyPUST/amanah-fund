import crypto from 'node:crypto';
import type { EncryptedEnvelope } from '../types/coop.ts';

const KEY_VERSION = 'aes-256-gcm-v1';
let warnedWeakKey = false;

function resolveEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const seed = process.env.JWT_SECRET;
  if (seed && seed.length >= 16) {
    return crypto.createHash('sha256').update(seed).digest();
  }
  if (!warnedWeakKey && process.env.NODE_ENV === 'production') {
    warnedWeakKey = true;
    console.warn(
      '[SECURITY] ENCRYPTION_KEY (64-hex-char AES-256 key) is not configured in production! Falling back to deterministic development key.'
    );
  }
  return crypto
    .createHash('sha256')
    .update(seed || 'amanah-coop-default-dev-key-material-2026')
    .digest();
}

export function getEncryptionKeyStatus(): {
  configured: boolean;
  mode: 'custom_aes256' | 'jwt_derived' | 'dev_fallback';
} {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return { configured: true, mode: 'custom_aes256' };
  }
  const seed = process.env.JWT_SECRET;
  if (seed && seed.length >= 16) {
    return { configured: true, mode: 'jwt_derived' };
  }
  return { configured: false, mode: 'dev_fallback' };
}

export function encryptSensitiveObject<T extends object>(payload: T): EncryptedEnvelope {
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    keyVersion: KEY_VERSION,
  };
}

export function decryptSensitiveObject<T>(envelope: EncryptedEnvelope): T {
  const key = resolveEncryptionKey();
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted) as T;
}

export function computeSha256Hash(data: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export function maskReference(value: string): string {
  const clean = value.trim();
  if (clean.length <= 4) return '••••';
  return `••••${clean.slice(-4)}`;
}
