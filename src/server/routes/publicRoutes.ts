import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { getDb, HttpError, runInTransaction } from '../db.ts';
import {
  createRateLimiter,
  generateAccessToken,
  resolveFamilyByToken,
  sanitizePlainText,
} from '../security.ts';
import {
  getLegalDocumentRow,
  getLegalUploadsDir,
  listLegalDocuments,
  parseLegalDocKey,
} from '../services/legalService.ts';
import { createNotification } from '../services/notificationService.ts';

export const publicRouter = Router();

const resolveLinkLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Слишком много попыток входа. Пожалуйста, подождите минуту.',
});

const registerLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 15,
  message: 'Слишком много регистраций с одного устройства. Пожалуйста, подождите немного.',
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
        'SELECT id, title, lessons_count, price, validity_days FROM tariffs WHERE is_active = 1 ORDER BY lessons_count ASC, price ASC'
      )
      .all();

    const settings = db
      .prepare(
        `SELECT free_cancel_hours, charge_on_miss, charge_on_late_cancel,
                show_hero_age, hero_age_text, show_hero_duration, hero_duration_text,
                show_hero_groups, hero_groups_text, show_hero_free_cancel, default_group_capacity
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
      legal_documents: listLegalDocuments(),
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

publicRouter.post('/register', registerLimiter, (req, res, next) => {
  try {
    if (req.body?.personal_data_consent !== true) {
      throw new HttpError(400, 'Необходимо дать согласие на обработку персональных данных');
    }

    const rawChildren = Array.isArray(req.body?.children) ? req.body.children : [];
    const normalizedChildren: Array<{ name: string; age: number }> = [];

    for (const item of rawChildren.slice(0, 10)) {
      if (!item || typeof item !== 'object') continue;
      const name = sanitizePlainText((item as { name?: unknown }).name, 80);
      const rawChildAge = Number((item as { age?: unknown }).age ?? 10);
      const age = Number.isInteger(rawChildAge) && rawChildAge >= 3 && rawChildAge <= 99 ? rawChildAge : 10;
      if (name) {
        normalizedChildren.push({ name, age });
      }
    }

    const parentNameInput = sanitizePlainText(
      req.body?.parent_name ?? req.body?.full_name,
      120
    );
    const singleChildName = sanitizePlainText(req.body?.child_name, 80);
    const rawAge = req.body?.age !== undefined && req.body?.age !== '' ? Number(req.body.age) : 10;
    const singleAge = Number.isInteger(rawAge) && rawAge >= 3 && rawAge <= 99 ? rawAge : 10;

    if (normalizedChildren.length === 0) {
      const fallbackChildName = singleChildName || parentNameInput || 'Новый ученик';
      normalizedChildren.push({ name: fallbackChildName, age: singleAge });
    }

    const parentName =
      parentNameInput ||
      normalizedChildren[0]?.name ||
      'Новый ученик';

    const phone = sanitizePlainText(req.body?.phone, 30) || 'Не указан';
    const email = sanitizePlainText(req.body?.email, 120);
    const maxContact = sanitizePlainText(req.body?.max_contact, 120);

    const created = runInTransaction((db) => {
      const token = generateAccessToken();
      const nowIso = new Date().toISOString();
      const famRes = db
        .prepare(
          `INSERT INTO families (parent_name, phone, email, max_contact, access_token, money_balance, consented_at, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .run(parentName, phone, email, maxContact, token, nowIso, nowIso);
      const familyId = Number(famRes.lastInsertRowid);

      const insertChildStmt = db.prepare(
        'INSERT INTO children (family_id, name, age, notes) VALUES (?, ?, ?, ?)'
      );
      for (const child of normalizedChildren) {
        insertChildStmt.run(familyId, child.name, child.age, null);
      }

      createNotification(
        familyId,
        'Личный кабинет ученика создан',
        'Добро пожаловать в мастерскую «Ясна»! Сохраните вашу персональную ссылку для входа — по ней вы всегда сможете записаться на занятия и управлять анкетой.',
        db
      );

      return { familyId, token };
    });

    res.status(201).json({
      ok: true,
      family_id: created.familyId,
      token: created.token,
    });
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
