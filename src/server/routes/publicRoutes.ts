import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { getDb, HttpError } from '../db.ts';
import { createRateLimiter, resolveFamilyByToken } from '../security.ts';
import {
  getLegalDocumentRow,
  getLegalUploadsDir,
  listLegalDocuments,
  parseLegalDocKey,
} from '../services/legalService.ts';

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
      lesson_type: 'group' | 'masterclass' | 'individual' | 'birthday';
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
      .prepare(
        `SELECT free_cancel_hours, charge_on_miss, charge_on_late_cancel,
                show_hero_age, hero_age_text, show_hero_duration, hero_duration_text,
                show_hero_groups, hero_groups_text, show_hero_free_cancel
         FROM workshop_settings WHERE id = 1`
      )
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

publicRouter.get('/legal', (_req, res, next) => {
  try {
    res.json({ documents: listLegalDocuments() });
  } catch (err) {
    next(err);
  }
});

const LEGAL_MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

publicRouter.get('/legal/:docKey/file', (req, res, next) => {
  try {
    const docKey = parseLegalDocKey(req.params.docKey);
    const doc = getLegalDocumentRow(docKey);
    const inline = req.query.inline === '1';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader('Cache-Control', 'private, max-age=300');

    if (doc.file_path) {
      const legalDir = path.resolve(getLegalUploadsDir());
      const safeName = path.basename(doc.file_path);
      const fullPath = path.resolve(legalDir, safeName);
      if (!fullPath.startsWith(`${legalDir}${path.sep}`) || !fs.existsSync(fullPath)) {
        throw new HttpError(404, 'Файл документа не найден на сервере');
      }

      const ext = path.extname(safeName).toLowerCase();
      const canInline = ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.txt';
      const downloadName = (doc.original_name || `${doc.doc_key}${ext || '.pdf'}`)
        .replace(/[\r\n\u0000-\u001F\u007F]/g, '_')
        .slice(0, 200);

      const resolvedMime = LEGAL_MIME_BY_EXT[ext] ?? 'application/octet-stream';
      res.setHeader('Content-Type', resolvedMime);

      if (inline && canInline) {
        res.setHeader(
          'Content-Disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`
        );
        res.sendFile(fullPath);
        return;
      }

      res.download(fullPath, downloadName);
      return;
    }

    const fallbackFilename = `${doc.doc_key}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fallbackFilename)}`
    );
    res.send(doc.content_text);
  } catch (err) {
    next(err);
  }
});
