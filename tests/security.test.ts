import type { Request } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HttpError as HttpErrorType } from '../src/server/db.ts';

const tempDbPath = path.join(os.tmpdir(), `yasna-test-security-${Date.now()}.db`);
process.env.DATABASE_PATH = tempDbPath;

const { getDb, HttpError } = await import('../src/server/db.ts');
const { seedInitialDataIfEmpty } = await import('../src/server/seed.ts');
const {
  assertChildBelongsToFamily,
  generateAccessToken,
  getSafeRequestOrigin,
  hashPassword,
  resolveFamilyByToken,
  signMasterSession,
  verifyMasterSessionToken,
  verifyPassword,
} = await import('../src/server/security.ts');
const { exportClientsCsv } = await import('../src/server/services/exportService.ts');

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
});
