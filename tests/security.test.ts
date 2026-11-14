import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HttpError as HttpErrorType } from '../src/server/db.ts';

const tempDbPath = path.join(os.tmpdir(), `yasna-test-security-${Date.now()}.db`);
process.env.DATABASE_PATH = tempDbPath;

const { config } = await import('../src/server/config.ts');
const { getDb, HttpError } = await import('../src/server/db.ts');
const { seedInitialDataIfEmpty } = await import('../src/server/seed.ts');
const { masterRouter } = await import('../src/server/routes/masterRoutes.ts');
const { webhookRouter } = await import('../src/server/routes/webhookRoutes.ts');
const {
  assertChildBelongsToFamily,
  createRateLimiter,
  generateAccessToken,
  getSafeRequestOrigin,
  hashPassword,
  resolveFamilyByToken,
  signMasterSession,
  verifyMasterSessionToken,
  verifyPassword,
} = await import('../src/server/security.ts');
const { exportClientsCsv, importClientsFromCsv } = await import(
  '../src/server/services/exportService.ts'
);
const { createManualPayment, attachReceiptFile } = await import(
  '../src/server/services/paymentService.ts'
);
const { validatePushEndpoint } = await import('../src/server/services/pushService.ts');

describe('Security: Anti-IDOR, token validation & revocation', () => {
  beforeAll(() => {
    getDb();
    seedInitialDataIfEmpty();
  });

  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(`${tempDbPath}${suffix}`)) {
        fs.unlinkSync(`${tempDbPath}${suffix}`);
      }
    }
  });

  it('rejects sequential numeric IDs with 404', () => {
    for (const badId of ['1', '2', '999', 'short']) {
      try {
        resolveFamilyByToken(badId);
        expect.unreachable('Expected 404 for sequential ID');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpErrorType).statusCode).toBe(404);
      }
    }
  });

  it('blocks access to another family child (IDOR prevention)', () => {
    const db = getDb();
    const fam1 = db
      .prepare("SELECT id, access_token FROM families WHERE parent_name = 'Елена Смирнова'")
      .get() as { id: number; access_token: string };
    const fam2 = db
      .prepare("SELECT id FROM families WHERE parent_name = 'Алексей Иванов'")
      .get() as { id: number };
    const fam2Child = db
      .prepare('SELECT id FROM children WHERE family_id = ?')
      .get(fam2.id) as { id: number };

    const resolved = resolveFamilyByToken(fam1.access_token);
    expect(resolved.id).toBe(fam1.id);

    try {
      assertChildBelongsToFamily(fam2Child.id, fam1.id);
      expect.unreachable('Expected 403 Forbidden for foreign child');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpErrorType).statusCode).toBe(403);
    }
  });

  it('immediately invalidates old token after link regeneration', () => {
    const db = getDb();
    const fam1 = db
      .prepare("SELECT id, access_token FROM families WHERE parent_name = 'Елена Смирнова'")
      .get() as { id: number; access_token: string };
    const oldToken = fam1.access_token;
    const newToken = generateAccessToken();

    db.prepare('UPDATE families SET access_token = ? WHERE id = ?').run(newToken, fam1.id);

    expect(() => resolveFamilyByToken(oldToken)).toThrow(HttpError);
    expect(resolveFamilyByToken(newToken).id).toBe(fam1.id);
  });

  it('validates signed master session tokens and updates bcrypt password hash', () => {
    const sessionToken = signMasterSession();
    expect(verifyMasterSessionToken(sessionToken)).toBe(true);
    expect(verifyMasterSessionToken(`${sessionToken}tamper`)).toBe(false);

    const db = getDb();
    const newHash = hashPassword('new-master-pass-2026');
    db.prepare('UPDATE workshop_settings SET master_password_hash = ? WHERE id = 1').run(newHash);
    const updated = db
      .prepare('SELECT master_password_hash FROM workshop_settings WHERE id = 1')
      .get() as { master_password_hash: string };

    expect(verifyPassword('new-master-pass-2026', updated.master_password_hash)).toBe(true);
    expect(verifyPassword('wrong-password', updated.master_password_hash)).toBe(false);
    expect(verifyMasterSessionToken(sessionToken)).toBe(false);
  });

  it('neutralizes CSV formula injection while keeping normal phone numbers intact', () => {
    const db = getDb();
    db.prepare(
      'INSERT INTO families (parent_name, phone, access_token, money_balance, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run('=cmd|"/C calc"!A0', '+7 (922) 111-22-33', generateAccessToken(), -500, new Date().toISOString());

    const csv = exportClientsCsv();
    expect(csv).toContain('"\'=cmd|""/C calc""!A0"');
    expect(csv).toContain('+7 (922) 111-22-33');
    expect(csv).toContain('-500.00');
  });

  it('rejects malformed host headers when building return URLs', () => {
    const badReq = {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.com/redirect?to=' },
      protocol: 'https',
      get: () => 'evil.com/redirect',
    } as unknown as Request;
    expect(getSafeRequestOrigin(badReq)).toBeUndefined();

    const goodReq = {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'yasna-surgut.ru' },
      protocol: 'https',
      get: () => 'yasna-surgut.ru',
    } as unknown as Request;
    expect(getSafeRequestOrigin(goodReq)).toBe('https://yasna-surgut.ru');
  });

  it('blocks SSRF internal/loopback/metadata URLs and credentials in push endpoints', () => {
    for (const badUrl of [
      'http://localhost:8080/push',
      'http://127.0.0.1/push',
      'https://127.0.0.1/push',
      'https://169.254.169.254/latest/meta-data',
      'https://10.0.0.1/internal',
      'https://192.168.1.10/push',
      'https://[::1]/push',
      'https://metadata.internal/push',
      'https://user:pass@fcm.googleapis.com/push',
    ]) {
      expect(() => validatePushEndpoint(badUrl)).toThrow(HttpError);
    }

    expect(validatePushEndpoint('https://fcm.googleapis.com/fcm/send/abc123')).toBe(
      'https://fcm.googleapis.com/fcm/send/abc123'
    );
  });

  it('rejects URL query tokens for master and receipt endpoints and enforces rate limits', async () => {
    const db = getDb();
    const fam = db
      .prepare("SELECT id, access_token FROM families WHERE parent_name = 'Елена Смирнова'")
      .get() as { id: number; access_token: string };

    const { paymentId } = createManualPayment({
      familyId: fam.id,
      amount: 1200,
      lessonsCount: 1,
      paymentMethod: 'cash',
    });

    if (!fs.existsSync(config.uploadsDir)) {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
    }
    const storedName = `sec-test-${Date.now()}.pdf`;
    const receiptPath = path.join(config.uploadsDir, storedName);
    fs.writeFileSync(receiptPath, '%PDF-1.4\n%%EOF\n');
    attachReceiptFile(paymentId, storedName, 'Чек_тест.pdf');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    const testLimiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      message: 'Rate limit exceeded',
    });
    app.get('/api/limited', testLimiter, (_req, res) => res.json({ ok: true }));
    app.use('/api/master', masterRouter);
    app.use('/api', webhookRouter);
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof HttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Internal test error' });
    });

    let server!: http.Server;
    let baseUrl = '';
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });

    try {
      const masterToken = signMasterSession();
      // Reject master ?session= query param
      const queryMasterRes = await fetch(
        `${baseUrl}/api/master/dashboard?session=${encodeURIComponent(masterToken)}`
      );
      expect(queryMasterRes.status).toBe(401);

      // Accept master Bearer header
      const headerMasterRes = await fetch(`${baseUrl}/api/master/dashboard`, {
        headers: { Authorization: `Bearer ${masterToken}` },
      });
      expect(headerMasterRes.status).toBe(200);

      // Reject family ?token= query param on receipt download
      const queryReceiptRes = await fetch(
        `${baseUrl}/api/files/receipts/${paymentId}?token=${encodeURIComponent(fam.access_token)}`
      );
      expect(queryReceiptRes.status).toBe(404);

      // Accept X-Family-Token header and include CSP sandbox
      const headerReceiptRes = await fetch(`${baseUrl}/api/files/receipts/${paymentId}?inline=1`, {
        headers: { 'X-Family-Token': fam.access_token },
      });
      expect(headerReceiptRes.status).toBe(200);
      expect(headerReceiptRes.headers.get('content-security-policy')).toBe('sandbox');

      // Enforce 429 rate limiting
      expect((await fetch(`${baseUrl}/api/limited`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/limited`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/limited`)).status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (fs.existsSync(receiptPath)) {
        fs.unlinkSync(receiptPath);
      }
    }
  });

  it('rejects CSV import rows missing a phone number instead of inventing placeholder phones', () => {
    expect(() => importClientsFromCsv('Иван Петров;;Петя;8;2')).toThrow(HttpError);
  });
});
