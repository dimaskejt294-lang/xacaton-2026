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
const { parentRouter } = await import('../src/server/routes/parentRoutes.ts');
const { publicRouter } = await import('../src/server/routes/publicRoutes.ts');
const { signMasterSession } = await import('../src/server/security.ts');
const { createBooking, getActiveLessonsRemaining } = await import(
  '../src/server/services/bookingService.ts'
);
const { processUpcomingLessonReminders } = await import('../src/server/services/pushService.ts');

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
    app.use('/api/lk', parentRouter);
    app.use('/api/public', publicRouter);
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

  it('supports masterclass and birthday formats, legal docs update, and enforces checkout consents', async () => {
    const db = getDb();
    const futureIso = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    for (const fmt of ['masterclass', 'birthday'] as const) {
      const createRes = await fetch(`${baseUrl}/api/master/lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          title: fmt === 'masterclass' ? 'МК по выжиганию' : 'День рождения Артёма',
          lesson_type: fmt,
          start_time: futureIso,
          duration_minutes: 120,
          capacity: 8,
          single_price: 2500,
        }),
      });
      expect(createRes.status).toBe(201);
    }

    const legalRes = await fetch(`${baseUrl}/api/public/legal`);
    expect(legalRes.status).toBe(200);
    const legalBody = (await legalRes.json()) as { documents: Array<{ doc_key: string }> };
    expect(legalBody.documents.map((d) => d.doc_key)).toEqual([
      'offer',
      'personal_data',
      'privacy',
    ]);

    const editLegalRes = await fetch(`${baseUrl}/api/master/legal-documents/offer`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        title: 'Договор-оферта мастерской «Ясна»',
        content_text: 'Обновлённый текст договора-оферты для родителей.',
      }),
    });
    expect(editLegalRes.status).toBe(200);

    const fam = db
      .prepare('SELECT access_token FROM families WHERE id = ?')
      .get(family1Id) as { access_token: string };
    const tariff = db.prepare('SELECT id FROM tariffs WHERE is_active = 1 LIMIT 1').get() as {
      id: number;
    };

    const blockedPayRes = await fetch(`${baseUrl}/api/lk/${fam.access_token}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tariff_id: tariff.id,
        accepted_offer: true,
        accepted_personal_data: true,
        accepted_privacy: false,
      }),
    });
    expect(blockedPayRes.status).toBe(400);
  });

  it('provisions VAPID keys, validates & stores push subscriptions, and triggers 24h lesson reminders', async () => {
    const db = getDb();
    const fam = db
      .prepare('SELECT access_token FROM families WHERE id = ?')
      .get(family1Id) as { access_token: string };

    const keyRes = await fetch(`${baseUrl}/api/lk/${fam.access_token}/push/vapid-public-key`);
    expect(keyRes.status).toBe(200);
    const keyBody = (await keyRes.json()) as { publicKey: string };
    expect(keyBody.publicKey.length).toBeGreaterThan(20);

    // Reject insecure non-localhost HTTP endpoint
    const badSubRes = await fetch(`${baseUrl}/api/lk/${fam.access_token}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'http://evil.example/push',
        keys: { p256dh: 'abc', auth: 'def' },
      }),
    });
    expect(badSubRes.status).toBe(400);

    const endpoint = 'https://fcm.googleapis.com/fcm/send/yasna-test-endpoint';
    const subRes = await fetch(`${baseUrl}/api/lk/${fam.access_token}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' },
      }),
    });
    expect(subRes.status).toBe(201);
    const subBody = (await subRes.json()) as { count: number };
    expect(subBody.count).toBe(1);

    // Unsubscribe cleanly so createNotification doesn't attempt live network push in tests
    const unsubRes = await fetch(`${baseUrl}/api/lk/${fam.access_token}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    expect(unsubRes.status).toBe(200);
    const unsubBody = (await unsubRes.json()) as { count: number };
    expect(unsubBody.count).toBe(0);

    // Create a lesson starting in 4 hours, book child1, and verify reminder runs once
    const inFourHours = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const soonLessonRes = db
      .prepare(
        `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description, is_canceled)
         VALUES ('Скорое занятие: Токарка', 'group', ?, 90, 4, 1500, NULL, 0)`
      )
      .run(inFourHours);
    const soonLessonId = Number(soonLessonRes.lastInsertRowid);
    createBooking({ lessonId: soonLessonId, childId: child1Id, familyIdConstraint: family1Id });

    const sentCountFirst = processUpcomingLessonReminders();
    expect(sentCountFirst).toBeGreaterThanOrEqual(1);

    const reminderNotif = db
      .prepare(
        "SELECT title, message FROM notifications WHERE family_id = ? AND title = 'Напоминание о занятии' ORDER BY id DESC LIMIT 1"
      )
      .get(family1Id) as { title: string; message: string } | undefined;
    expect(reminderNotif?.title).toBe('Напоминание о занятии');

    // Second run must be idempotent (reminder_sent_at already set)
    const sentCountSecond = processUpcomingLessonReminders();
    expect(sentCountSecond).toBe(0);

    // Master marks attended & missed -> notifications created for parents
    const { updateBookingStatusByMaster } = await import(
      '../src/server/services/bookingService.ts'
    );
    const soonBooking = db
      .prepare('SELECT id FROM bookings WHERE lesson_id = ? AND child_id = ?')
      .get(soonLessonId, child1Id) as { id: number };
    updateBookingStatusByMaster({ bookingId: soonBooking.id, newStatus: 'attended' });

    const attendedNotif = db
      .prepare(
        "SELECT title FROM notifications WHERE family_id = ? AND title = 'Посещение отмечено' ORDER BY id DESC LIMIT 1"
      )
      .get(family1Id) as { title: string } | undefined;
    expect(attendedNotif?.title).toBe('Посещение отмечено');

    updateBookingStatusByMaster({ bookingId: soonBooking.id, newStatus: 'missed' });
    const missedNotif = db
      .prepare(
        "SELECT title FROM notifications WHERE family_id = ? AND title = 'Отмечен пропуск занятия' ORDER BY id DESC LIMIT 1"
      )
      .get(family1Id) as { title: string } | undefined;
    expect(missedNotif?.title).toBe('Отмечен пропуск занятия');
  });

  it('allows master to toggle and edit main-page hero fact cards', async () => {
    const updRes = await fetch(`${baseUrl}/api/master/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        free_cancel_hours: 12,
        charge_on_miss: true,
        charge_on_late_cancel: true,
        show_hero_age: false,
        hero_age_text: '7–15 лет',
        show_hero_duration: true,
        hero_duration_text: '120 минут',
        show_hero_groups: true,
        hero_groups_text: 'до 6 мест',
        show_hero_free_cancel: false,
      }),
    });
    expect(updRes.status).toBe(200);

    const pubRes = await fetch(`${baseUrl}/api/public/schedule`);
    expect(pubRes.status).toBe(200);
    const pubBody = (await pubRes.json()) as {
      settings: {
        free_cancel_hours: number;
        show_hero_age: number;
        hero_age_text: string;
        show_hero_duration: number;
        hero_duration_text: string;
        show_hero_groups: number;
        hero_groups_text: string;
        show_hero_free_cancel: number;
      };
    };
    expect(pubBody.settings.free_cancel_hours).toBe(12);
    expect(pubBody.settings.show_hero_age).toBe(0);
    expect(pubBody.settings.hero_age_text).toBe('7–15 лет');
    expect(pubBody.settings.show_hero_duration).toBe(1);
    expect(pubBody.settings.hero_duration_text).toBe('120 минут');
    expect(pubBody.settings.show_hero_groups).toBe(1);
    expect(pubBody.settings.hero_groups_text).toBe('до 6 мест');
    expect(pubBody.settings.show_hero_free_cancel).toBe(0);
  });
});
