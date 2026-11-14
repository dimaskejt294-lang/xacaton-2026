import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tempDbPath = path.join(os.tmpdir(), `yasna-test-master-${Date.now()}.db`);
process.env.DATABASE_PATH = tempDbPath;

const { getDb, HttpError } = await import('../src/server/db.ts');
const { seedInitialDataIfEmpty } = await import('../src/server/seed.ts');
const { masterRouter } = await import('../src/server/routes/masterRoutes.ts');
const { signMasterSession } = await import('../src/server/security.ts');
const { createBooking, getActiveLessonsRemaining } = await import(
  '../src/server/services/bookingService.ts'
);

describe('Master routes: tariffs, direct subscriptions & lesson editing', () => {
  let server: http.Server;
  let baseUrl = '';
  let sessionToken = '';
  let family1Id = 0;
  let child1Id = 0;
  let child2Id = 0;
  let lessonId = 0;

  beforeAll(async () => {
    const db = getDb();
    seedInitialDataIfEmpty();

    const fam1 = db
      .prepare("SELECT id FROM families WHERE parent_name = 'Елена Смирнова'")
      .get() as { id: number };
    family1Id = fam1.id;

    const children = db
      .prepare('SELECT id FROM children WHERE family_id = ? ORDER BY id ASC')
      .all(family1Id) as Array<{ id: number }>;
    child1Id = children[0].id;
    child2Id = children[1].id;

    const lesson = db
      .prepare('SELECT id FROM lessons WHERE capacity >= 2 AND is_canceled = 0 LIMIT 1')
      .get() as { id: number };
    lessonId = lesson.id;

    sessionToken = signMasterSession();

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/master', masterRouter);
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof HttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Internal test error' });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(`${tempDbPath}${suffix}`)) {
        fs.unlinkSync(`${tempDbPath}${suffix}`);
      }
    }
  });

  it('creates a custom tariff and toggles its active state', async () => {
    const createRes = await fetch(`${baseUrl}/api/master/tariffs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        title: 'Абонемент на 6 занятий',
        lessons_count: 6,
        price: 5700,
        validity_days: 60,
      }),
    });
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as { tariff_id: number };
    expect(createdBody.tariff_id).toBeGreaterThan(0);

    const toggleOffRes = await fetch(
      `${baseUrl}/api/master/tariffs/${createdBody.tariff_id}/toggle`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }
    );
    expect(toggleOffRes.status).toBe(200);
    const toggleOffBody = (await toggleOffRes.json()) as { is_active: number };
    expect(toggleOffBody.is_active).toBe(0);

    const toggleOnRes = await fetch(
      `${baseUrl}/api/master/tariffs/${createdBody.tariff_id}/toggle`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }
    );
    expect(toggleOnRes.status).toBe(200);
    const toggleOnBody = (await toggleOnRes.json()) as { is_active: number };
    expect(toggleOnBody.is_active).toBe(1);
  });

  it('grants a subscription directly to a family and sends a notification', async () => {
    const db = getDb();
    const beforeLessons = getActiveLessonsRemaining(db, family1Id);

    const res = await fetch(`${baseUrl}/api/master/families/${family1Id}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        title: 'Подарочный абонемент',
        lessons_count: 3,
        validity_days: 30,
      }),
    });

    expect(res.status).toBe(201);
    const afterLessons = getActiveLessonsRemaining(db, family1Id);
    expect(afterLessons).toBe(beforeLessons + 3);

    const notif = db
      .prepare(
        "SELECT title FROM notifications WHERE family_id = ? AND title = 'Начислен абонемент' ORDER BY id DESC LIMIT 1"
      )
      .get(family1Id) as { title: string } | undefined;
    expect(notif?.title).toBe('Начислен абонемент');
  });

  it('edits an existing lesson and blocks reducing capacity below booked count with 409', async () => {
    createBooking({ lessonId, childId: child1Id, familyIdConstraint: family1Id });
    createBooking({ lessonId, childId: child2Id, familyIdConstraint: family1Id });

    const futureIso = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();

    const okEditRes = await fetch(`${baseUrl}/api/master/lessons/${lessonId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        title: 'Обновлённое занятие: Шкатулка',
        lesson_type: 'group',
        start_time: futureIso,
        duration_minutes: 120,
        capacity: 4,
        single_price: 1500,
        description: 'Обновлённое описание',
      }),
    });
    expect(okEditRes.status).toBe(200);

    const conflictRes = await fetch(`${baseUrl}/api/master/lessons/${lessonId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        title: 'Слишком мало мест',
        lesson_type: 'group',
        start_time: futureIso,
        duration_minutes: 90,
        capacity: 1,
        single_price: 1500,
      }),
    });
    expect(conflictRes.status).toBe(409);
  });

  it('allows master to toggle and delete parent reviews', async () => {
    const db = getDb();
    const nowIso = new Date().toISOString();
    const insertRes = db
      .prepare(
        `INSERT INTO reviews (family_id, author_name, child_info, rating, text, is_published, created_at)
         VALUES (?, 'Елена Смирнова', 'Артём (8 лет)', 5, 'Отличное занятие по работе с кедром!', 1, ?)`
      )
      .run(family1Id, nowIso);
    const reviewId = Number(insertRes.lastInsertRowid);

    const toggleRes = await fetch(`${baseUrl}/api/master/reviews/${reviewId}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(toggleRes.status).toBe(200);
    const toggleBody = (await toggleRes.json()) as { is_published: number };
    expect(toggleBody.is_published).toBe(0);

    const deleteRes = await fetch(`${baseUrl}/api/master/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(deleteRes.status).toBe(200);
    const deletedRow = db.prepare('SELECT id FROM reviews WHERE id = ?').get(reviewId);
    expect(deletedRow).toBeUndefined();
  });
});
