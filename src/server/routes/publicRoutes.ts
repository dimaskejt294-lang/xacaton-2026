import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { getDb, HttpError } from '../db.ts';
import { createRateLimiter, resolveFamilyByToken } from '../security.ts';

export const publicRouter = Router();

const resolveLinkLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Слишком много попыток входа. Пожалуйста, подождите минуту.',
});

publicRouter.get('/schedule', (_req, res, next) => {
  try {
    const db = getDb();
    const lessons = db
      .prepare(
        `SELECT l.id, l.title, l.lesson_type, l.start_time, l.duration_minutes,
                l.capacity, l.single_price, l.description, l.is_canceled,
                (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id = l.id AND b.status IN ('booked', 'attended')) AS booked_count,
                (SELECT COUNT(*) FROM waitlist w WHERE w.lesson_id = l.id AND w.status IN ('waiting', 'notified')) AS waitlist_count
         FROM lessons l
         WHERE l.is_canceled = 0 AND l.start_time >= datetime('now', '-2 hours')
         ORDER BY l.start_time ASC`
      )
      .all() as Array<{
      id: number;
      title: string;
      lesson_type: 'group' | 'individual';
      start_time: string;
      duration_minutes: number;
      capacity: number;
      single_price: number;
      description: string | null;
      is_canceled: number;
      booked_count: number;
      waitlist_count: number;
    }>;

    const tariffs = db
      .prepare(
        'SELECT id, title, lessons_count, price, validity_days FROM tariffs WHERE is_active = 1 ORDER BY lessons_count ASC'
      )
      .all();

    const settings = db
      .prepare('SELECT free_cancel_hours, charge_on_miss, charge_on_late_cancel FROM workshop_settings WHERE id = 1')
      .get();

    const reviews = db
      .prepare(
        `SELECT id, family_id, author_name, child_info, rating, text, is_published, created_at
         FROM reviews
         WHERE is_published = 1
         ORDER BY created_at DESC, id DESC`
      )
      .all();

    res.json({
      lessons: lessons.map((l) => ({
        ...l,
        free_spots: Math.max(0, l.capacity - l.booked_count),
      })),
      tariffs,
      settings,
      reviews,
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/resolve-link', resolveLinkLimiter, (req, res, next) => {
  try {
    const raw = String(req.query.input ?? '').trim();
    if (!raw) {
      throw new HttpError(400, 'Вставьте персональную ссылку или код доступа');
    }

    let token = raw;
    const match = raw.match(/\/lk\/([A-Za-z0-9_-]+)/);
    if (match?.[1]) {
      token = match[1];
    }

    const family = resolveFamilyByToken(token);
    res.json({ valid: true, token: family.access_token });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/guide-pdf', (_req, res, next) => {
  try {
    const pdfPath = path.resolve(process.cwd(), 'docs/yasna-guide.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new HttpError(404, 'PDF-документация не найдена на сервере');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.download(pdfPath, 'yasna-documentation-v1.pdf');
  } catch (err) {
    next(err);
  }
});
