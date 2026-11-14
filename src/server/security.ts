import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { config } from './config.ts';
import { getDb, HttpError } from './db.ts';

export const MASTER_SESSION_COOKIE = 'yasna_master_session';

export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

function getPasswordVersionTag(): string {
  const db = getDb();
  const row = db
    .prepare('SELECT master_password_hash FROM workshop_settings WHERE id = 1')
    .get() as { master_password_hash: string } | undefined;
  return crypto
    .createHash('sha256')
    .update(row?.master_password_hash ?? '')
    .digest('base64url')
    .slice(0, 12);
}

export function signMasterSession(): string {
  const issuedAt = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const pwTag = getPasswordVersionTag();
  const payload = `master.${issuedAt}.${nonce}.${pwTag}`;
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `master.${issuedAt}.${nonce}.${sig}`;
}

export function verifyMasterSessionToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'master') {
    return false;
  }
  const pwTag = getPasswordVersionTag();
  const payload = `${parts[0]}.${parts[1]}.${parts[2]}.${pwTag}`;
  const expectedSig = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payload)
    .digest('base64url');
  const providedBuf = Buffer.from(parts[3], 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return false;
  }
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - issuedAt < sevenDaysMs;
}

export function isMasterAuthenticated(req: Request): boolean {
  const cookieToken = req.cookies?.[MASTER_SESSION_COOKIE] as string | undefined;
  if (verifyMasterSessionToken(cookieToken)) {
    return true;
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice('Bearer '.length).trim();
    if (verifyMasterSessionToken(bearerToken)) {
      return true;
    }
  }
  return false;
}

export function sanitizePlainText(raw: unknown, maxLength: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function parsePositiveIntId(raw: unknown, errorMessage: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, errorMessage);
  }
  return parsed;
}

export function requireMasterAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!isMasterAuthenticated(req)) {
    next(new HttpError(401, 'Требуется авторизация руководителя мастерской'));
    return;
  }
  next();
}

export interface FamilyRow {
  id: number;
  parent_name: string;
  phone: string;
  access_token: string;
  money_balance: number;
  created_at: string;
}

export function resolveFamilyByToken(token: string): FamilyRow {
  // Reject sequential numeric IDs and invalid formats explicitly (anti-IDOR)
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token) || /^\d+$/.test(token)) {
    throw new HttpError(404, 'Кабинет по указанной ссылке не найден или ссылка была отозвана');
  }

  const db = getDb();
  const row = db
    .prepare('SELECT id, parent_name, phone, access_token, money_balance, created_at FROM families WHERE access_token = ?')
    .get(token) as FamilyRow | undefined;

  if (!row) {
    throw new HttpError(404, 'Кабинет по указанной ссылке не найден или ссылка была отозвана');
  }

  return row;
}

export function assertChildBelongsToFamily(childId: number, familyId: number): void {
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM children WHERE id = ? AND family_id = ?')
    .get(childId, familyId) as { id: number } | undefined;

  if (!row) {
    throw new HttpError(403, 'Доступ запрещён: ребёнок не относится к вашей семье');
  }
}

export function assertBookingBelongsToFamily(bookingId: number, familyId: number): void {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT b.id
       FROM bookings b
       JOIN children c ON c.id = b.child_id
       WHERE b.id = ? AND c.family_id = ?`
    )
    .get(bookingId, familyId) as { id: number } | undefined;

  if (!row) {
    throw new HttpError(403, 'Доступ запрещён: запись не относится к вашей семье');
  }
}

export function assertNotificationBelongsToFamily(notificationId: number, familyId: number): void {
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM notifications WHERE id = ? AND family_id = ?')
    .get(notificationId, familyId) as { id: number } | undefined;

  if (!row) {
    throw new HttpError(403, 'Доступ запрещён: уведомление не относится к вашей семье');
  }
}

export function getSafeRequestOrigin(req: Request): string | undefined {
  const rawProto = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim() || req.protocol;
  const proto = rawProto === 'http' || rawProto === 'https' ? rawProto : 'https';
  const rawHost = (req.headers['x-forwarded-host']?.toString().split(',')[0] || req.get('host') || '').trim();
  if (!rawHost || !/^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost)) {
    return undefined;
  }
  return `${proto}://${rawHost}`;
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message: string;
}): (req: Request, res: Response, next: NextFunction) => void {
  const hits = new Map<string, number[]>();
  let lastCleanup = Date.now();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const cutoff = now - options.windowMs;

    if (now - lastCleanup > options.windowMs) {
      for (const [key, timestamps] of hits.entries()) {
        const recent = timestamps.filter((t) => t > cutoff);
        if (recent.length === 0) {
          hits.delete(key);
        } else {
          hits.set(key, recent);
        }
      }
      lastCleanup = now;
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = (hits.get(clientIp) ?? []).filter((t) => t > cutoff);
    if (existing.length >= options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing[0] + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: options.message });
      return;
    }

    existing.push(now);
    hits.set(clientIp, existing);
    next();
  };
}
