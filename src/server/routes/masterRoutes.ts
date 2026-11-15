import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { getDb, HttpError, runInTransaction } from '../db.ts';
import {
  createRateLimiter,
  generateAccessToken,
  hashPassword,
  isMasterAuthenticated,
  MASTER_SESSION_COOKIE,
  parsePositiveIntId,
  requireMasterAuth,
  sanitizePlainText,
  signMasterSession,
  verifyPassword,
} from '../security.ts';
import {
  createBooking,
  updateBookingStatusByMaster,
  type BookingStatus,
} from '../services/bookingService.ts';
import {
  createDatabaseBackupFile,
  exportAttendanceCsv,
  exportClientsCsv,
  exportPaymentsCsv,
  getDatabaseFileSizeBytes,
  importClientsFromCsv,
} from '../services/exportService.ts';
import {
  deleteLegalDocumentFile,
  getLegalUploadsDir,
  listLegalDocuments,
  parseLegalDocKey,
  saveLegalDocumentFile,
  updateLegalDocumentText,
} from '../services/legalService.ts';
import { createNotification } from '../services/notificationService.ts';
import { sendPushToFamily } from '../services/pushService.ts';
import {
  attachReceiptFile,
  attachReceiptUrl,
  createManualPayment,
} from '../services/paymentService.ts';

const ALLOWED_RECEIPT_EXTS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_RECEIPT_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const ALLOWED_LEGAL_EXTS = new Set(['.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_LEGAL_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function decodeUploadedFilename(raw: string): string {
  if (!raw) return 'receipt';
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (/[А-Яа-яЁё]/.test(decoded) && !/[А-Яа-яЁё]/.test(raw)) {
      return decoded;
    }
  } catch {
    // Fallback to raw original name
  }
  return raw;
}

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, config.uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID().replace(/-/g, '')}${ext}`);
    },
  }),
  limits: {
    fileSize: 5_000_000, // 5 MB
    files: 1,
    fields: 10,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_RECEIPT_EXTS.has(ext) || !ALLOWED_RECEIPT_MIMES.has(file.mimetype)) {
      cb(new HttpError(400, 'Разрешены только файлы чеков PDF, PNG, JPG или WebP размером до 5 МБ'));
      return;
    }
    cb(null, true);
  },
});

function hasValidReceiptMagicBytes(filePath: string, ext: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    if (bytesRead < 4) return false;

    if (ext === '.pdf') {
      return buf.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    if (ext === '.png') {
      return (
        bytesRead >= 8 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      );
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    }
    if (ext === '.webp') {
      return (
        bytesRead >= 12 &&
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  } catch (err) {
    console.warn('[MasterRoutes] Ошибка проверки magic bytes файла чека:', err);
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (closeErr) {
        console.warn('[MasterRoutes] Ошибка закрытия fd чека:', closeErr);
      }
    }
  }
}

const legalUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, getLegalUploadsDir());
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID().replace(/-/g, '')}${ext}`);
    },
  }),
  limits: {
    fileSize: 8_000_000, // strictly <= 8,000,000 bytes (SonarQube S5693)
    files: 1,
    fields: 10,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_LEGAL_EXTS.has(ext) || !ALLOWED_LEGAL_MIMES.has(file.mimetype)) {
      cb(
        new HttpError(
          400,
          'Разрешены только файлы PDF, DOCX, TXT, PNG, JPG или WebP размером до 8 МБ'
        )
      );
      return;
    }
    cb(null, true);
  },
});

function hasValidLegalMagicBytes(filePath: string, ext: string): boolean {
  if (ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
    return hasValidReceiptMagicBytes(filePath, ext);
  }
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    if (ext === '.docx') {
      return (
        bytesRead >= 4 &&
        buf[0] === 0x50 &&
        buf[1] === 0x4b &&
        (buf[2] === 0x03 || buf[2] === 0x05) &&
        (buf[3] === 0x04 || buf[3] === 0x06)
      );
    }
    if (ext === '.txt') {
      if (bytesRead === 0) return false;
      return !buf.subarray(0, bytesRead).includes(0);
    }
    return false;
  } catch (err) {
    console.warn('[MasterRoutes] Ошибка проверки magic bytes документа:', err);
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (closeErr) {
        console.warn('[MasterRoutes] Ошибка закрытия fd документа:', closeErr);
      }
    }
  }
}

export const masterRouter = Router();

const masterLoginLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 15,
  message: 'Слишком много попыток входа. Повторите через 5 минут.',
});

masterRouter.get('/session', (req, res) => {
  res.json({ authenticated: isMasterAuthenticated(req) });
});

masterRouter.post('/login', masterLoginLimiter, (req, res, next) => {
  try {
    const password = String(req.body?.password ?? '');
    if (!password) {
      throw new HttpError(400, 'Введите пароль');
    }
    if (password.length > 128) {
      throw new HttpError(400, 'Пароль не должен превышать 128 символов');
    }

    const db = getDb();
    const row = db
      .prepare('SELECT master_password_hash FROM workshop_settings WHERE id = 1')
      .get() as { master_password_hash: string } | undefined;

    if (!row || !verifyPassword(password, row.master_password_hash)) {
      throw new HttpError(401, 'Неверный пароль руководителя мастерской');
    }

    const sessionToken = signMasterSession();
    const forwardedProto = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim();
    const isHttps = req.secure || forwardedProto === 'https';

    res.cookie(MASTER_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ ok: true, session_token: sessionToken });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/logout', (req, res) => {
  const forwardedProto = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim();
  const isHttps = req.secure || forwardedProto === 'https';
  res.clearCookie(MASTER_SESSION_COOKIE, {
    path: '/',
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
  res.json({ ok: true });
});

masterRouter.use(requireMasterAuth);

masterRouter.get('/dashboard', (_req, res, next) => {
  try {
    const db = getDb();
    const nowIso = new Date().toISOString();

    const lessons = db
      .prepare(
        `SELECT id, title, lesson_type, start_time, duration_minutes, capacity, single_price, description, is_canceled
         FROM lessons
         ORDER BY start_time DESC`
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
    }>;

    const allBookings = db
      .prepare(
        `SELECT b.id, b.lesson_id, b.child_id, b.status, b.is_charged, b.charge_amount, b.is_makeup, b.updated_at,
                c.name AS child_name, c.age AS child_age, f.id AS family_id, f.parent_name, f.phone,
                f.email, f.max_contact, f.access_token
         FROM bookings b
         JOIN children c ON c.id = b.child_id
         JOIN families f ON f.id = c.family_id
         ORDER BY b.id ASC`
      )
      .all() as Array<{
      id: number;
      lesson_id: number;
      child_id: number;
      status: BookingStatus;
      is_charged: number;
      charge_amount: number;
      is_makeup: number;
      updated_at: string;
      child_name: string;
      child_age: number;
      family_id: number;
      parent_name: string;
      phone: string;
      email: string;
      max_contact: string;
      access_token: string;
    }>;

    const allLogs = db
      .prepare(
        `SELECT al.id, al.booking_id, al.old_status, al.new_status, al.reason, al.changed_at,
                c.name AS child_name, l.title AS lesson_title
         FROM attendance_logs al
         JOIN bookings b ON b.id = al.booking_id
         JOIN children c ON c.id = b.child_id
         JOIN lessons l ON l.id = b.lesson_id
         ORDER BY al.changed_at DESC, al.id DESC
         LIMIT 100`
      )
      .all();

    const allWaitlist = db
      .prepare(
        `SELECT w.id, w.lesson_id, w.child_id, w.status, w.created_at,
                c.name AS child_name, c.age AS child_age, f.id AS family_id,
                f.parent_name, f.phone, f.email, f.max_contact, f.access_token
         FROM waitlist w
         JOIN children c ON c.id = w.child_id
         JOIN families f ON f.id = c.family_id
         WHERE w.status IN ('waiting', 'notified')
         ORDER BY w.created_at ASC`
      )
      .all() as Array<{
      id: number;
      lesson_id: number;
      family_id: number;
      child_id: number;
      child_age: number;
      status: string;
      created_at: string;
      child_name: string;
      parent_name: string;
      phone: string;
      email: string;
      max_contact: string;
      access_token: string;
    }>;

    const families = db
      .prepare(
        'SELECT id, parent_name, phone, email, max_contact, access_token, money_balance, created_at FROM families ORDER BY id ASC'
      )
      .all() as Array<{
      id: number;
      parent_name: string;
      phone: string;
      email: string;
      max_contact: string;
      access_token: string;
      money_balance: number;
      created_at: string;
    }>;

    const children = db
      .prepare('SELECT id, family_id, name, age, notes FROM children ORDER BY id ASC')
      .all() as Array<{
      id: number;
      family_id: number;
      name: string;
      age: number;
      notes: string | null;
    }>;

    const subscriptions = db
      .prepare(
        `SELECT id, family_id, tariff_id, title, total_lessons, remaining_lessons, expires_at, created_at
         FROM subscriptions
         WHERE remaining_lessons > 0 AND expires_at > ?
         ORDER BY expires_at ASC`
      )
      .all(nowIso) as Array<{
      id: number;
      family_id: number;
      tariff_id: number | null;
      title: string;
      total_lessons: number;
      remaining_lessons: number;
      expires_at: string;
      created_at: string;
    }>;

    const payments = db
      .prepare(
        `SELECT p.id, p.family_id, p.tariff_id, p.external_payment_id, p.amount, p.lessons_count,
                p.payment_method, p.status, p.receipt_url,
                CASE WHEN p.receipt_file_path IS NOT NULL THEN 1 ELSE 0 END AS has_receipt_file,
                p.receipt_original_name, p.created_at, p.paid_at,
                f.parent_name, f.phone, t.title AS tariff_title
         FROM payments p
         JOIN families f ON f.id = p.family_id
         LEFT JOIN tariffs t ON t.id = p.tariff_id
         ORDER BY p.created_at DESC, p.id DESC`
      )
      .all();

    const tariffs = db
      .prepare('SELECT id, title, lessons_count, price, validity_days, is_active FROM tariffs ORDER BY lessons_count ASC')
      .all();

    const settings = db
      .prepare(
        `SELECT free_cancel_hours, charge_on_miss, charge_on_late_cancel,
                show_hero_age, hero_age_text, show_hero_duration, hero_duration_text,
                show_hero_groups, hero_groups_text, show_hero_free_cancel
         FROM workshop_settings WHERE id = 1`
      )
      .get();

    const enrichedLessons = lessons.map((lesson) => {
      const lessonBookings = allBookings.filter((b) => b.lesson_id === lesson.id);
      const activeCount = lessonBookings.filter(
        (b) => b.status === 'booked' || b.status === 'attended'
      ).length;
      const lessonWaitlist = allWaitlist.filter((w) => w.lesson_id === lesson.id);
      return {
        ...lesson,
        booked_count: activeCount,
        free_spots: Math.max(0, lesson.capacity - activeCount),
        bookings: lessonBookings,
        waitlist: lessonWaitlist,
      };
    });

    const enrichedFamilies = families.map((family) => {
      const famChildren = children.filter((c) => c.family_id === family.id);
      const famSubs = subscriptions.filter((s) => s.family_id === family.id);
      const remainingLessons = famSubs.reduce((acc, s) => acc + s.remaining_lessons, 0);
      return {
        ...family,
        children: famChildren,
        subscriptions: famSubs,
        remaining_lessons: remainingLessons,
        needs_renewal: remainingLessons <= 1 || family.money_balance < 0,
      };
    });

    const reviews = db
      .prepare(
        `SELECT id, family_id, author_name, child_info, rating, text, is_published, created_at
         FROM reviews
         ORDER BY created_at DESC, id DESC`
      )
      .all();

    res.json({
      lessons: enrichedLessons,
      families: enrichedFamilies,
      payments,
      tariffs,
      attendance_logs: allLogs,
      reviews,
      legal_documents: listLegalDocuments(),
      settings,
      db_size_bytes: getDatabaseFileSizeBytes(),
    });
  } catch (err) {
    next(err);
  }
});

function normalizeLessonType(raw: unknown): 'group' | 'masterclass' | 'individual' | 'birthday' {
  if (raw === 'masterclass' || raw === 'individual' || raw === 'birthday') {
    return raw;
  }
  return 'group';
}

masterRouter.post('/lessons', (req, res, next) => {
  try {
    const title = sanitizePlainText(req.body?.title, 140);
    const lessonType = normalizeLessonType(req.body?.lesson_type);
    const startTimeRaw = String(req.body?.start_time ?? '').trim();
    const durationMinutes = Number(req.body?.duration_minutes ?? 120);
    const capacity = Number(req.body?.capacity ?? (lessonType === 'individual' ? 1 : 4));
    const singlePrice = Number(req.body?.single_price ?? 1200);
    const description = sanitizePlainText(req.body?.description, 1000) || null;

    if (!title || !startTimeRaw) {
      throw new HttpError(400, 'Укажите название и дату начала занятия');
    }
    const parsedDate = new Date(startTimeRaw);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new HttpError(400, 'Некорректная дата и время занятия');
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) {
      throw new HttpError(400, 'Длительность занятия должна быть от 15 до 720 минут');
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      throw new HttpError(400, 'Вместимость группы должна быть от 1 до 100 мест');
    }
    if (!Number.isFinite(singlePrice) || singlePrice < 0 || singlePrice > 1_000_000) {
      throw new HttpError(400, 'Цена занятия должна быть от 0 до 1 000 000 ₽');
    }

    const db = getDb();
    const resDb = db
      .prepare(
        `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description, is_canceled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        title,
        lessonType,
        parsedDate.toISOString(),
        durationMinutes,
        capacity,
        singlePrice,
        description
      );

    res.status(201).json({ ok: true, lesson_id: Number(resDb.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

masterRouter.patch('/lessons/:lessonId', (req, res, next) => {
  try {
    const lessonId = parsePositiveIntId(req.params.lessonId, 'Некорректный ID занятия');

    const title = sanitizePlainText(req.body?.title, 140);
    const lessonType = normalizeLessonType(req.body?.lesson_type);
    const startTimeRaw = String(req.body?.start_time ?? '').trim();
    const durationMinutes = Number(req.body?.duration_minutes ?? 120);
    const capacity = Number(req.body?.capacity ?? (lessonType === 'individual' ? 1 : 4));
    const singlePrice = Number(req.body?.single_price ?? 1200);
    const description = sanitizePlainText(req.body?.description, 1000) || null;

    if (!title || !startTimeRaw) {
      throw new HttpError(400, 'Укажите название и дату начала занятия');
    }
    const parsedDate = new Date(startTimeRaw);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new HttpError(400, 'Некорректная дата и время занятия');
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) {
      throw new HttpError(400, 'Длительность занятия должна быть от 15 до 720 минут');
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      throw new HttpError(400, 'Вместимость группы должна быть от 1 до 100 мест');
    }
    if (!Number.isFinite(singlePrice) || singlePrice < 0 || singlePrice > 1_000_000) {
      throw new HttpError(400, 'Цена занятия должна быть от 0 до 1 000 000 ₽');
    }

    const db = getDb();
    const activeBooked = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM bookings WHERE lesson_id = ? AND status IN ('booked', 'attended')"
      )
      .get(lessonId) as { cnt: number };

    if (capacity < activeBooked.cnt) {
      throw new HttpError(
        409,
        `Нельзя уменьшить вместимость меньше числа уже записанных (${activeBooked.cnt})`
      );
    }

    const result = db
      .prepare(
        `UPDATE lessons
         SET title = ?, lesson_type = ?, start_time = ?, duration_minutes = ?,
             capacity = ?, single_price = ?, description = ?
         WHERE id = ?`
      )
      .run(
        title,
        lessonType,
        parsedDate.toISOString(),
        durationMinutes,
        capacity,
        singlePrice,
        description,
        lessonId
      );

    if (result.changes === 0) {
      throw new HttpError(404, 'Занятие не найдено');
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.patch('/lessons/:lessonId/cancel', (req, res, next) => {
  try {
    const lessonId = parsePositiveIntId(req.params.lessonId, 'Некорректный ID занятия');

    runInTransaction((db) => {
      const lesson = db
        .prepare('SELECT id, title, start_time, is_canceled FROM lessons WHERE id = ?')
        .get(lessonId) as { id: number; title: string; start_time: string; is_canceled: number } | undefined;

      if (!lesson) {
        throw new HttpError(404, 'Занятие не найдено');
      }

      db.prepare('UPDATE lessons SET is_canceled = 1 WHERE id = ?').run(lesson.id);

      const affectedBookings = db
        .prepare(
          `SELECT b.id, c.family_id, c.name AS child_name
           FROM bookings b
           JOIN children c ON c.id = b.child_id
           WHERE b.lesson_id = ? AND b.status = 'booked'`
        )
        .all(lesson.id) as Array<{ id: number; family_id: number; child_name: string }>;

      const nowIso = new Date().toISOString();
      for (const b of affectedBookings) {
        db.prepare("UPDATE bookings SET status = 'canceled', updated_at = ? WHERE id = ?").run(nowIso, b.id);
        db.prepare(
          `INSERT INTO attendance_logs (booking_id, old_status, new_status, reason, changed_at)
           VALUES (?, 'booked', 'canceled', 'Занятие отменено мастером', ?)`
        ).run(b.id, nowIso);
        createNotification(
          b.family_id,
          'Занятие отменено мастерской',
          `Занятие «${lesson.title}» отменено мастером. Запись ребёнка (${b.child_name}) снята без списания.`,
          db
        );
      }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/bookings', (req, res, next) => {
  try {
    const lessonId = parsePositiveIntId(req.body?.lesson_id, 'Укажите корректное занятие');
    const childId = parsePositiveIntId(req.body?.child_id, 'Укажите корректного ребёнка');
    const isMakeup = Boolean(req.body?.is_makeup);
    const result = createBooking({ lessonId, childId, isMakeup, allowOverCapacity: true });
    res.status(201).json({ ok: true, booking_id: result.bookingId });
  } catch (err) {
    next(err);
  }
});

masterRouter.patch('/bookings/:bookingId/status', (req, res, next) => {
  try {
    const bookingId = parsePositiveIntId(req.params.bookingId, 'Некорректный ID записи');
    const newStatus = String(req.body?.status ?? '') as BookingStatus;
    const reason = req.body?.reason ? sanitizePlainText(req.body.reason, 300) : undefined;

    if (!['booked', 'attended', 'missed', 'canceled'].includes(newStatus)) {
      throw new HttpError(400, 'Недопустимый статус посещения');
    }

    updateBookingStatusByMaster({ bookingId, newStatus, reason });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/waitlist/:waitlistId/convert', (req, res, next) => {
  try {
    const waitlistId = parsePositiveIntId(req.params.waitlistId, 'Некорректный ID листа ожидания');

    const db = getDb();
    const row = db
      .prepare('SELECT lesson_id, child_id FROM waitlist WHERE id = ?')
      .get(waitlistId) as { lesson_id: number; child_id: number } | undefined;

    if (!row) {
      throw new HttpError(404, 'Запись в листе ожидания не найдена');
    }

    const result = createBooking({
      lessonId: row.lesson_id,
      childId: row.child_id,
      allowOverCapacity: true,
    });
    res.json({ ok: true, booking_id: result.bookingId });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/families', (req, res, next) => {
  try {
    const parentName = sanitizePlainText(req.body?.parent_name, 120);
    const phone = sanitizePlainText(req.body?.phone, 30);
    const email = sanitizePlainText(req.body?.email, 120);
    const maxContact = sanitizePlainText(req.body?.max_contact, 120);
    const childName = sanitizePlainText(req.body?.child_name, 80);
    const childAge = Number(req.body?.child_age ?? 8);
    const childNotes = sanitizePlainText(req.body?.child_notes, 300) || null;

    if (!parentName || phone.length < 5 || !childName) {
      throw new HttpError(400, 'Укажите ФИО родителя, корректный телефон и имя ученика');
    }
    if (!Number.isInteger(childAge) || childAge < 3 || childAge > 99) {
      throw new HttpError(400, 'Возраст ученика должен быть от 3 до 99 лет');
    }

    const created = runInTransaction((db) => {
      const token = generateAccessToken();
      const nowIso = new Date().toISOString();
      const famRes = db
        .prepare(
          'INSERT INTO families (parent_name, phone, email, max_contact, access_token, money_balance, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
        )
        .run(parentName, phone, email, maxContact, token, nowIso);
      const familyId = Number(famRes.lastInsertRowid);

      db.prepare('INSERT INTO children (family_id, name, age, notes) VALUES (?, ?, ?, ?)').run(
        familyId,
        childName,
        childAge,
        childNotes
      );

      createNotification(
        familyId,
        'Личный кабинет активирован',
        'Добро пожаловать в мастерскую «Ясна»! Здесь отображаются ваше расписание, абонементы и чеки.',
        db
      );

      return { familyId, token };
    });

    res.status(201).json({ ok: true, family_id: created.familyId, access_token: created.token });
  } catch (err) {
    next(err);
  }
});

masterRouter.put('/families/:familyId/profile', (req, res, next) => {
  try {
    const familyId = parsePositiveIntId(req.params.familyId, 'Некорректный ID семьи');
    const parentName = sanitizePlainText(req.body?.parent_name, 120);
    const phone = sanitizePlainText(req.body?.phone, 30);
    const email = sanitizePlainText(req.body?.email, 120);
    const maxContact = sanitizePlainText(req.body?.max_contact, 120);
    const childId = req.body?.child_id ? Number(req.body.child_id) : null;
    const childName = sanitizePlainText(req.body?.child_name, 80);
    const childAge = req.body?.child_age !== undefined ? Number(req.body.child_age) : null;

    if (!parentName || phone.length < 3) {
      throw new HttpError(400, 'Укажите ФИО и телефон');
    }

    const db = getDb();
    const fam = db.prepare('SELECT id FROM families WHERE id = ?').get(familyId);
    if (!fam) {
      throw new HttpError(404, 'Семья не найдена');
    }

    db.prepare(
      'UPDATE families SET parent_name = ?, phone = ?, email = ?, max_contact = ? WHERE id = ?'
    ).run(parentName, phone, email, maxContact, familyId);

    if (childId && childName && childAge !== null && Number.isInteger(childAge) && childAge >= 3 && childAge <= 99) {
      db.prepare('UPDATE children SET name = ?, age = ? WHERE id = ? AND family_id = ?').run(
        childName,
        childAge,
        childId,
        familyId
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/families/:familyId/children', (req, res, next) => {
  try {
    const familyId = parsePositiveIntId(req.params.familyId, 'Некорректный ID семьи');
    const name = sanitizePlainText(req.body?.name, 80);
    const age = Number(req.body?.age ?? 8);
    const notes = sanitizePlainText(req.body?.notes, 300) || null;

    if (!name) {
      throw new HttpError(400, 'Укажите имя ученика');
    }
    if (!Number.isInteger(age) || age < 3 || age > 99) {
      throw new HttpError(400, 'Возраст должен быть от 3 до 99 лет');
    }

    const db = getDb();
    const fam = db.prepare('SELECT id FROM families WHERE id = ?').get(familyId);
    if (!fam) {
      throw new HttpError(404, 'Семья не найдена');
    }

    const resDb = db
      .prepare('INSERT INTO children (family_id, name, age, notes) VALUES (?, ?, ?, ?)')
      .run(familyId, name, age, notes);
    res.status(201).json({ ok: true, child_id: Number(resDb.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/families/:familyId/regenerate-token', (req, res, next) => {
  try {
    const familyId = parsePositiveIntId(req.params.familyId, 'Некорректный ID семьи');

    const db = getDb();
    const newToken = generateAccessToken();
    const result = db.prepare('UPDATE families SET access_token = ? WHERE id = ?').run(newToken, familyId);
    if (result.changes === 0) {
      throw new HttpError(404, 'Семья не найдена');
    }

    res.json({ ok: true, access_token: newToken });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/families/:familyId/remind', (req, res, next) => {
  try {
    const familyId = parsePositiveIntId(req.params.familyId, 'Некорректный ID семьи');

    const db = getDb();
    const fam = db.prepare('SELECT id FROM families WHERE id = ?').get(familyId);
    if (!fam) {
      throw new HttpError(404, 'Семья не найдена');
    }

    const message =
      sanitizePlainText(req.body?.message, 1000) ||
      'Напоминаем о продлении абонемента или погашении остатка в мастерской «Ясна». Оплатить можно в разделе «Оплаты и чеки».';

    createNotification(familyId, 'Напоминание от мастера', message);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/families/:familyId/subscriptions', (req, res, next) => {
  try {
    const familyId = parsePositiveIntId(req.params.familyId, 'Некорректный ID семьи');

    const tariffId = req.body?.tariff_id
      ? parsePositiveIntId(req.body.tariff_id, 'Некорректный ID тарифа')
      : null;
    const customTitle = sanitizePlainText(req.body?.title, 120);
    const customLessons = Number(req.body?.lessons_count ?? 0);
    const customDays = Number(req.body?.validity_days ?? 45);

    const created = runInTransaction((db) => {
      const fam = db.prepare('SELECT id FROM families WHERE id = ?').get(familyId);
      if (!fam) {
        throw new HttpError(404, 'Семья не найдена');
      }

      let title = customTitle;
      let lessonsCount = customLessons;
      let validityDays = customDays;
      let resolvedTariffId: number | null = null;

      if (tariffId) {
        const tariff = db
          .prepare('SELECT id, title, lessons_count, validity_days FROM tariffs WHERE id = ?')
          .get(tariffId) as
          | { id: number; title: string; lessons_count: number; validity_days: number }
          | undefined;
        if (!tariff) {
          throw new HttpError(404, 'Выбранный тариф не найден');
        }
        resolvedTariffId = tariff.id;
        title = tariff.title;
        lessonsCount = tariff.lessons_count;
        validityDays = tariff.validity_days;
      }

      if (!title) {
        title = `Абонемент на ${lessonsCount} зан.`;
      }
      if (!Number.isInteger(lessonsCount) || lessonsCount < 1 || lessonsCount > 1000) {
        throw new HttpError(400, 'Количество занятий должно быть от 1 до 1000');
      }
      if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
        throw new HttpError(400, 'Срок действия должен быть от 1 до 3650 дней');
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
      const subRes = db
        .prepare(
          `INSERT INTO subscriptions (family_id, tariff_id, title, total_lessons, remaining_lessons, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          familyId,
          resolvedTariffId,
          title,
          lessonsCount,
          lessonsCount,
          expiresAt.toISOString(),
          now.toISOString()
        );

      createNotification(
        familyId,
        'Начислен абонемент',
        `Мастер добавил вам абонемент «${title}» (+${lessonsCount} зан., действует ${validityDays} дн.).`,
        db
      );

      return { subscriptionId: Number(subRes.lastInsertRowid) };
    });

    res.status(201).json({ ok: true, subscription_id: created.subscriptionId });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/tariffs', (req, res, next) => {
  try {
    const title = sanitizePlainText(req.body?.title, 120);
    const lessonsCount = Number(req.body?.lessons_count);
    const price = Number(req.body?.price);
    const validityDays = Number(req.body?.validity_days ?? 45);

    if (!title) {
      throw new HttpError(400, 'Укажите название тарифа абонемента');
    }
    if (!Number.isInteger(lessonsCount) || lessonsCount < 1 || lessonsCount > 1000) {
      throw new HttpError(400, 'Количество занятий должно быть от 1 до 1000');
    }
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
      throw new HttpError(400, 'Стоимость должна быть больше 0 и не выше 1 000 000 ₽');
    }
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
      throw new HttpError(400, 'Срок действия должен быть от 1 до 3650 дней');
    }

    const db = getDb();
    const resDb = db
      .prepare(
        `INSERT INTO tariffs (title, lessons_count, price, validity_days, is_active)
         VALUES (?, ?, ?, ?, 1)`
      )
      .run(title, lessonsCount, price, validityDays);

    res.status(201).json({ ok: true, tariff_id: Number(resDb.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

masterRouter.patch('/tariffs/:tariffId/toggle', (req, res, next) => {
  try {
    const tariffId = parsePositiveIntId(req.params.tariffId, 'Некорректный ID тарифа');

    const db = getDb();
    const existing = db
      .prepare('SELECT id, is_active FROM tariffs WHERE id = ?')
      .get(tariffId) as { id: number; is_active: number } | undefined;

    if (!existing) {
      throw new HttpError(404, 'Тариф не найден');
    }

    const nextActive = existing.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE tariffs SET is_active = ? WHERE id = ?').run(nextActive, tariffId);
    res.json({ ok: true, is_active: nextActive });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/payments/manual', (req, res, next) => {
  try {
    const familyId = parsePositiveIntId(req.body?.family_id, 'Выберите семью');
    const tariffId = req.body?.tariff_id
      ? parsePositiveIntId(req.body.tariff_id, 'Некорректный ID тарифа')
      : null;
    const amount = req.body?.amount !== undefined ? Number(req.body.amount) : undefined;
    const lessonsCount = req.body?.lessons_count !== undefined ? Number(req.body.lessons_count) : undefined;
    const method = req.body?.payment_method === 'cash' ? 'cash' : 'transfer';

    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)) {
      throw new HttpError(400, 'Сумма оплаты должна быть от 1 до 1 000 000 ₽');
    }
    if (lessonsCount !== undefined && (!Number.isInteger(lessonsCount) || lessonsCount < 0 || lessonsCount > 1000)) {
      throw new HttpError(400, 'Количество занятий должно быть от 0 до 1000');
    }

    const result = createManualPayment({
      familyId,
      tariffId,
      amount,
      lessonsCount,
      paymentMethod: method,
    });

    res.status(201).json({ ok: true, payment_id: result.paymentId });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/payments/:paymentId/receipt-url', (req, res, next) => {
  try {
    const paymentId = parsePositiveIntId(req.params.paymentId, 'Некорректный ID платежа');
    const receiptUrl = String(req.body?.receipt_url ?? '');
    attachReceiptUrl(paymentId, receiptUrl);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.post(
  '/payments/:paymentId/receipt-file',
  receiptUpload.single('file'),
  (req, res, next) => {
    try {
      const paymentId = parsePositiveIntId(req.params.paymentId, 'Некорректный ID платежа');
      if (!req.file) {
        throw new HttpError(400, 'Выберите файл чека (PDF, PNG, JPG или WebP)');
      }
      const ext = path.extname(req.file.filename).toLowerCase();
      if (!hasValidReceiptMagicBytes(req.file.path, ext)) {
        throw new HttpError(400, 'Содержимое файла не соответствует формату PDF, PNG, JPG или WebP');
      }
      const originalName = decodeUploadedFilename(req.file.originalname);
      attachReceiptFile(paymentId, req.file.filename, originalName);
      res.json({ ok: true });
    } catch (err) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupErr) {
          console.warn('[MasterRoutes] Не удалось удалить временный файл чека:', cleanupErr);
        }
      }
      next(err);
    }
  }
);

masterRouter.put('/settings', (req, res, next) => {
  try {
    const db = getDb();
    const existing = db
      .prepare(
        `SELECT free_cancel_hours, charge_on_miss, charge_on_late_cancel,
                show_hero_age, hero_age_text, show_hero_duration, hero_duration_text,
                show_hero_groups, hero_groups_text, show_hero_free_cancel
         FROM workshop_settings WHERE id = 1`
      )
      .get() as
      | {
          free_cancel_hours: number;
          charge_on_miss: number;
          charge_on_late_cancel: number;
          show_hero_age: number;
          hero_age_text: string;
          show_hero_duration: number;
          hero_duration_text: string;
          show_hero_groups: number;
          hero_groups_text: string;
          show_hero_free_cancel: number;
        }
      | undefined;

    const freeCancelHours = Number(req.body?.free_cancel_hours);
    const chargeOnMiss = req.body?.charge_on_miss ? 1 : 0;
    const chargeOnLateCancel = req.body?.charge_on_late_cancel ? 1 : 0;

    if (!Number.isInteger(freeCancelHours) || freeCancelHours < 0 || freeCancelHours > 168) {
      throw new HttpError(400, 'Срок бесплатной отмены должен быть от 0 до 168 часов');
    }

    const toFlag = (val: unknown, fallback: number): number => {
      if (val === undefined) return fallback;
      return val === true || val === 1 || val === '1' ? 1 : 0;
    };

    const sanitizeText = (val: unknown, fallback: string, label: string): string => {
      if (val === undefined) return fallback;
      const cleaned = String(val)
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .trim();
      if (!cleaned || cleaned.length > 40) {
        throw new HttpError(400, `Поле «${label}» должно содержать от 1 до 40 символов`);
      }
      return cleaned;
    };

    const showHeroAge = toFlag(req.body?.show_hero_age, existing?.show_hero_age ?? 1);
    const heroAgeText = sanitizeText(
      req.body?.hero_age_text,
      existing?.hero_age_text ?? '6–14 лет',
      'Возраст'
    );
    const showHeroDuration = toFlag(req.body?.show_hero_duration, existing?.show_hero_duration ?? 1);
    const heroDurationText = sanitizeText(
      req.body?.hero_duration_text,
      existing?.hero_duration_text ?? '2 часа',
      'Длительность'
    );
    const showHeroGroups = toFlag(req.body?.show_hero_groups, existing?.show_hero_groups ?? 1);
    const heroGroupsText = sanitizeText(
      req.body?.hero_groups_text,
      existing?.hero_groups_text ?? '2–4 места',
      'Группы'
    );
    const showHeroFreeCancel = toFlag(
      req.body?.show_hero_free_cancel,
      existing?.show_hero_free_cancel ?? 1
    );

    db.prepare(
      `UPDATE workshop_settings
       SET free_cancel_hours = ?, charge_on_miss = ?, charge_on_late_cancel = ?,
           show_hero_age = ?, hero_age_text = ?,
           show_hero_duration = ?, hero_duration_text = ?,
           show_hero_groups = ?, hero_groups_text = ?,
           show_hero_free_cancel = ?
       WHERE id = 1`
    ).run(
      freeCancelHours,
      chargeOnMiss,
      chargeOnLateCancel,
      showHeroAge,
      heroAgeText,
      showHeroDuration,
      heroDurationText,
      showHeroGroups,
      heroGroupsText,
      showHeroFreeCancel
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.put('/password', (req, res, next) => {
  try {
    const currentPassword = String(req.body?.current_password ?? '');
    const newPassword = String(req.body?.new_password ?? '');

    if (!currentPassword || !newPassword) {
      throw new HttpError(400, 'Заполните текущий и новый пароль');
    }
    if (newPassword.length < 6 || newPassword.length > 72) {
      throw new HttpError(400, 'Новый пароль должен содержать от 6 до 72 символов');
    }

    const db = getDb();
    const row = db
      .prepare('SELECT master_password_hash FROM workshop_settings WHERE id = 1')
      .get() as { master_password_hash: string } | undefined;

    if (!row || !verifyPassword(currentPassword, row.master_password_hash)) {
      throw new HttpError(403, 'Текущий пароль указан неверно');
    }

    const nextHash = hashPassword(newPassword);
    db.prepare('UPDATE workshop_settings SET master_password_hash = ? WHERE id = 1').run(nextHash);

    const refreshedToken = signMasterSession();
    const forwardedProto = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim();
    const isHttps = req.secure || forwardedProto === 'https';

    res.cookie(MASTER_SESSION_COOKIE, refreshedToken, {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ ok: true, session_token: refreshedToken });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/import-csv', (req, res, next) => {
  try {
    const csvText = String(req.body?.csv_text ?? '');
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : undefined;
    const result = importClientsFromCsv(csvText, rows);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

masterRouter.get('/export/:type', (req, res, next) => {
  try {
    const type = req.params.type;
    let csvContent = '';
    let filename = 'export.csv';

    if (type === 'clients') {
      csvContent = exportClientsCsv();
      filename = 'yasna-clients.csv';
    } else if (type === 'attendance') {
      csvContent = exportAttendanceCsv();
      filename = 'yasna-attendance.csv';
    } else if (type === 'payments') {
      csvContent = exportPaymentsCsv();
      filename = 'yasna-payments.csv';
    } else {
      throw new HttpError(404, 'Неизвестный тип отчёта');
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

masterRouter.patch('/reviews/:reviewId/toggle', (req, res, next) => {
  try {
    const reviewId = parsePositiveIntId(req.params.reviewId, 'Некорректный ID отзыва');
    const db = getDb();
    const existing = db
      .prepare('SELECT id, is_published FROM reviews WHERE id = ?')
      .get(reviewId) as { id: number; is_published: number } | undefined;
    if (!existing) {
      throw new HttpError(404, 'Отзыв не найден');
    }
    const nextPublished = existing.is_published === 1 ? 0 : 1;
    db.prepare('UPDATE reviews SET is_published = ? WHERE id = ?').run(nextPublished, reviewId);
    res.json({ ok: true, is_published: nextPublished });
  } catch (err) {
    next(err);
  }
});

masterRouter.delete('/reviews/:reviewId', (req, res, next) => {
  try {
    const reviewId = parsePositiveIntId(req.params.reviewId, 'Некорректный ID отзыва');
    const db = getDb();
    const result = db.prepare('DELETE FROM reviews WHERE id = ?').run(reviewId);
    if (result.changes === 0) {
      throw new HttpError(404, 'Отзыв не найден');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.post(
  '/legal-documents/:docKey/file',
  legalUpload.single('file'),
  (req, res, next) => {
    try {
      const docKey = parseLegalDocKey(req.params.docKey);
      if (!req.file) {
        throw new HttpError(400, 'Выберите файл документа (PDF, DOCX, TXT, PNG, JPG или WebP)');
      }
      const ext = path.extname(req.file.filename).toLowerCase();
      if (!hasValidLegalMagicBytes(req.file.path, ext)) {
        throw new HttpError(400, 'Содержимое файла не соответствует выбранному формату');
      }
      const originalName = decodeUploadedFilename(req.file.originalname);
      saveLegalDocumentFile({
        docKey,
        storedFileName: req.file.filename,
        originalName,
        mimeType: req.file.mimetype,
      });
      res.json({ ok: true });
    } catch (err) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupErr) {
          console.warn('[MasterRoutes] Не удалось удалить временный файл документа:', cleanupErr);
        }
      }
      next(err);
    }
  }
);

masterRouter.put('/legal-documents/:docKey', (req, res, next) => {
  try {
    const docKey = parseLegalDocKey(req.params.docKey);
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const contentText = String(req.body?.content_text ?? '');
    updateLegalDocumentText({ docKey, title, contentText });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.delete('/legal-documents/:docKey/file', (req, res, next) => {
  try {
    const docKey = parseLegalDocKey(req.params.docKey);
    deleteLegalDocumentFile(docKey);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

masterRouter.post('/notifications/broadcast', async (req, res, next) => {
  try {
    const rawTitle = String(req.body?.title ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim();
    const rawMessage = String(req.body?.message ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim();

    const title = rawTitle || 'Тестовое уведомление от мастерской «Ясна»';
    const message =
      rawMessage ||
      'Проверка связи! Сюда приходят напоминания о занятиях, чеки об оплате и отметки посещаемости.';

    if (title.length > 120) {
      throw new HttpError(400, 'Заголовок уведомления не должен превышать 120 символов');
    }
    if (message.length > 1000) {
      throw new HttpError(400, 'Текст уведомления не должен превышать 1000 символов');
    }

    const db = getDb();
    const families = db
      .prepare('SELECT id, access_token FROM families ORDER BY id ASC')
      .all() as Array<{ id: number; access_token: string }>;

    runInTransaction((tx) => {
      for (const fam of families) {
        createNotification(fam.id, title, message, tx, { skipPush: true });
      }
    });

    let pushSent = 0;
    let pushRemoved = 0;
    const deliveries = await Promise.all(
      families.map((fam) =>
        sendPushToFamily(fam.id, {
          title,
          body: message,
          url: `/lk/${encodeURIComponent(fam.access_token)}`,
          tag: 'yasna-broadcast-test',
        })
      )
    );
    for (const d of deliveries) {
      pushSent += d.sent;
      pushRemoved += d.removed;
    }

    res.json({
      ok: true,
      families_count: families.length,
      push_sent: pushSent,
      push_removed: pushRemoved,
    });
  } catch (err) {
    next(err);
  }
});

masterRouter.get('/backup', (_req, res, next) => {
  try {
    const backup = createDatabaseBackupFile();
    res.download(backup.filePath, `yasna-backup-${new Date().toISOString().slice(0, 10)}.db`, (err) => {
      backup.cleanup();
      if (err) {
        console.error('[Backup] Download failed:', err);
      }
    });
  } catch (err) {
    next(err);
  }
});
