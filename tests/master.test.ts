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

  it('broadcasts a test notification to all families from master panel', async () => {
    const db = getDb();
    const totalFamilies = (db.prepare('SELECT COUNT(*) AS cnt FROM families').get() as { cnt: number }).cnt;
    expect(totalFamilies).toBeGreaterThanOrEqual(2);

    const res = await fetch(`${baseUrl}/api/master/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        title: 'Общая проверка связи',
        message: 'Тестовое уведомление для всех родителей мастерской.',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      families_count: number;
      push_sent: number;
    };
    expect(body.ok).toBe(true);
    expect(body.families_count).toBe(totalFamilies);

    const rows = db
      .prepare("SELECT COUNT(*) AS cnt FROM notifications WHERE title = 'Общая проверка связи'")
      .get() as { cnt: number };
    expect(rows.cnt).toBe(totalFamilies);
  });

  it('seeds updated tariffs, group lesson titles, skips 2026-11-29, supports cancel-date, custom 5000 RUB payment & configurable capacity', async () => {
    const db = getDb();

    const tariffs = db
      .prepare('SELECT id, title, lessons_count, price FROM tariffs WHERE is_active = 1 ORDER BY lessons_count ASC, price ASC')
      .all() as Array<{ id: number; title: string; lessons_count: number; price: number }>;

    expect(tariffs.some((t) => t.title === 'Пробное занятие' && t.price === 1000)).toBe(true);
    expect(tariffs.some((t) => t.title === 'Разовое занятие' && t.price === 1600)).toBe(true);
    const tariff4 = tariffs.find((t) => t.lessons_count === 4);
    expect(tariff4?.price).toBe(5500);
    expect(tariffs.some((t) => t.lessons_count === 8)).toBe(false);

    // Ensure no seeded slots fall on 2026-11-29 in Surgut
    const nov29Slots = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM lessons
         WHERE start_time >= '2026-11-28T19:00:00.000Z'
           AND start_time < '2026-11-29T19:00:00.000Z'`
      )
      .get() as { cnt: number };
    expect(nov29Slots.cnt).toBe(0);

    // Record manual payment for 4-lesson tariff at regular-client price 5000 RUB
    const beforeLessons = getActiveLessonsRemaining(db, family1Id);
    const payRes = await fetch(`${baseUrl}/api/master/payments/manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        family_id: family1Id,
        tariff_id: tariff4?.id,
        amount: 5000,
        payment_method: 'cash',
      }),
    });
    expect(payRes.status).toBe(201);
    const payBody = (await payRes.json()) as { payment_id: number };
    const paymentRow = db
      .prepare('SELECT amount, lessons_count, tariff_id FROM payments WHERE id = ?')
      .get(payBody.payment_id) as { amount: number; lessons_count: number; tariff_id: number };
    expect(paymentRow.amount).toBe(5000);
    expect(paymentRow.lessons_count).toBe(4);
    expect(paymentRow.tariff_id).toBe(tariff4?.id);
    expect(getActiveLessonsRemaining(db, family1Id)).toBe(beforeLessons + 4);

    // Cancel a specific date (2026-12-16) while leaving other dates intact
    const slot1 = new Date('2026-12-16T10:00:00+05:00').toISOString();
    const slot2 = new Date('2026-12-16T13:00:00+05:00').toISOString();
    const slotOtherDay = new Date('2026-12-17T10:00:00+05:00').toISOString();

    const l1 = Number(
      db
        .prepare(
          `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price)
           VALUES ('Групповое занятие', 'group', ?, 120, 4, 1600)`
        )
        .run(slot1).lastInsertRowid
    );
    const l2 = Number(
      db
        .prepare(
          `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price)
           VALUES ('Групповое занятие', 'group', ?, 120, 4, 1600)`
        )
        .run(slot2).lastInsertRowid
    );
    const lKeep = Number(
      db
        .prepare(
          `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price)
           VALUES ('Групповое занятие', 'group', ?, 120, 4, 1600)`
        )
        .run(slotOtherDay).lastInsertRowid
    );

    createBooking({ lessonId: l1, childId: child1Id, familyIdConstraint: family1Id });

    const cancelDateRes = await fetch(`${baseUrl}/api/master/lessons/cancel-date`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ date: '2026-12-16' }),
    });
    expect(cancelDateRes.status).toBe(200);
    const cancelDateBody = (await cancelDateRes.json()) as {
      canceled_count: number;
      canceled_bookings_count: number;
    };
    expect(cancelDateBody.canceled_count).toBe(2);
    expect(cancelDateBody.canceled_bookings_count).toBe(1);

    const checkL1 = db.prepare('SELECT is_canceled FROM lessons WHERE id = ?').get(l1) as { is_canceled: number };
    const checkL2 = db.prepare('SELECT is_canceled FROM lessons WHERE id = ?').get(l2) as { is_canceled: number };
    const checkKeep = db.prepare('SELECT is_canceled FROM lessons WHERE id = ?').get(lKeep) as { is_canceled: number };
    expect(checkL1.is_canceled).toBe(1);
    expect(checkL2.is_canceled).toBe(1);
    expect(checkKeep.is_canceled).toBe(0);

    // Update default_group_capacity and apply to upcoming group lessons
    const capRes = await fetch(`${baseUrl}/api/master/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        free_cancel_hours: 24,
        charge_on_miss: true,
        charge_on_late_cancel: true,
        default_group_capacity: 6,
        apply_capacity_to_upcoming_groups: true,
      }),
    });
    expect(capRes.status).toBe(200);
    const updatedKeep = db.prepare('SELECT capacity FROM lessons WHERE id = ?').get(lKeep) as { capacity: number };
    expect(updatedKeep.capacity).toBe(6);
  });

  it('attaches official legal PDFs and supports multi-child registration & profile updates', async () => {
    const db = getDb();

    const legalRes = await fetch(`${baseUrl}/api/public/legal`);
    expect(legalRes.status).toBe(200);
    const legalBody = (await legalRes.json()) as {
      documents: Array<{ doc_key: string; has_file: number; mime_type: string | null }>;
    };
    const privacyDoc = legalBody.documents.find((d) => d.doc_key === 'privacy');
    const pdDoc = legalBody.documents.find((d) => d.doc_key === 'personal_data');
    expect(privacyDoc?.has_file).toBe(1);
    expect(privacyDoc?.mime_type).toBe('application/pdf');
    expect(pdDoc?.has_file).toBe(1);
    expect(pdDoc?.mime_type).toBe('application/pdf');

    const regRes = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_name: 'Мария Потапова',
        children: [
          { name: 'Потапов Артём', age: 8 },
          { name: 'Потапова Алиса', age: 11 },
        ],
        phone: '+79227684371',
        email: 'potapova@example.com',
        max_contact: '@mariya',
        personal_data_consent: true,
      }),
    });
    expect(regRes.status).toBe(201);
    const regBody = (await regRes.json()) as { token: string };
    expect(regBody.token).toBeTruthy();

    const lkRes1 = await fetch(`${baseUrl}/api/lk/${encodeURIComponent(regBody.token)}`);
    expect(lkRes1.status).toBe(200);
    const lkBody1 = (await lkRes1.json()) as {
      family: { parent_name: string; consented_at?: string | null };
      children: Array<{ id: number; name: string; age: number }>;
    };
    expect(lkBody1.family.parent_name).toBe('Мария Потапова');
    expect(lkBody1.children.map((c) => c.name)).toEqual(['Потапов Артём', 'Потапова Алиса']);

    // Update existing children and add a 3rd child via PUT /api/lk/:token/profile
    const updateRes = await fetch(
      `${baseUrl}/api/lk/${encodeURIComponent(regBody.token)}/profile`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_name: 'Мария Потапова',
          phone: '+79227684371',
          email: 'potapova@example.com',
          max_contact: '@mariya',
          children: [
            { id: lkBody1.children[0].id, name: 'Потапов Артём', age: 9 },
            { id: lkBody1.children[1].id, name: 'Потапова Алиса', age: 11 },
            { name: 'Потапов Тимофей', age: 6 },
          ],
        }),
      }
    );
    expect(updateRes.status).toBe(200);

    const famRow = db
      .prepare('SELECT id FROM families WHERE access_token = ?')
      .get(regBody.token) as { id: number };
    const updatedKids = db
      .prepare('SELECT name, age FROM children WHERE family_id = ? ORDER BY id ASC')
      .all(famRow.id) as Array<{ name: string; age: number }>;
    expect(updatedKids).toEqual([
      { name: 'Потапов Артём', age: 9 },
      { name: 'Потапова Алиса', age: 11 },
      { name: 'Потапов Тимофей', age: 6 },
    ]);
  });
});
