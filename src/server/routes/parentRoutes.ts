import { Router } from 'express';
import { getDb, HttpError } from '../db.ts';
import {
  assertBookingBelongsToFamily,
  assertNotificationBelongsToFamily,
  createRateLimiter,
  getSafeRequestOrigin,
  parsePositiveIntId,
  resolveFamilyByToken,
} from '../security.ts';
import {
  cancelBookingByParent,
  createBooking,
  getActiveLessonsRemaining,
  joinWaitlist,
} from '../services/bookingService.ts';
import {
  createNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService.ts';
import { listLegalDocuments } from '../services/legalService.ts';
import {
  createOnlinePaymentForTariff,
  verifyAndApplyYooKassaPayment,
} from '../services/paymentService.ts';
import {
  getPushSubscriptionCount,
  getVapidPublicKey,
  removePushSubscription,
  savePushSubscription,
  sendPushToFamily,
} from '../services/pushService.ts';

export const parentRouter = Router();

const parentReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'Слишком много запросов к личному кабинету. Подождите минуту.',
});

const parentActionLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Слишком много действий за минуту. Пожалуйста, подождите.',
});

const parentPaymentLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 15,
  message: 'Слишком много попыток оплаты. Подождите 5 минут.',
});

const parentReviewLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
  message: 'Слишком частая отправка отзывов. Попробуйте чуть позже.',
});

const parentPushTestLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
  message: 'Слишком много тестовых уведомлений. Подождите 5 минут.',
});

parentRouter.get('/:token', parentReadLimiter, (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const db = getDb();

    const children = db
      .prepare('SELECT id, family_id, name, age, notes FROM children WHERE family_id = ? ORDER BY id ASC')
      .all(family.id);

    const nowIso = new Date().toISOString();
    const subscriptions = db
      .prepare(
        `SELECT id, title, total_lessons, remaining_lessons, expires_at, created_at
         FROM subscriptions
         WHERE family_id = ? AND expires_at > ? AND remaining_lessons > 0
         ORDER BY expires_at ASC, id ASC`
      )
      .all(family.id, nowIso) as Array<{
      id: number;
      title: string;
      total_lessons: number;
      remaining_lessons: number;
      expires_at: string;
      created_at: string;
    }>;

    const totalRemainingLessons = getActiveLessonsRemaining(db, family.id);

    const bookings = db
      .prepare(
        `SELECT b.id, b.lesson_id, b.child_id, b.status, b.is_charged, b.charge_amount, b.is_makeup,
                b.created_at, b.updated_at,
                c.name AS child_name,
                l.title AS lesson_title, l.lesson_type, l.start_time, l.duration_minutes, l.single_price, l.is_canceled
         FROM bookings b
         JOIN children c ON c.id = b.child_id
         JOIN lessons l ON l.id = b.lesson_id
         WHERE c.family_id = ?
         ORDER BY l.start_time DESC, b.id DESC`
      )
      .all(family.id);

    const waitlistEntries = db
      .prepare(
        `SELECT w.id, w.lesson_id, w.child_id, w.status, w.created_at,
                c.name AS child_name, l.title AS lesson_title, l.start_time
         FROM waitlist w
         JOIN children c ON c.id = w.child_id
         JOIN lessons l ON l.id = w.lesson_id
         WHERE c.family_id = ? AND w.status IN ('waiting', 'notified')
         ORDER BY l.start_time ASC`
      )
      .all(family.id);

    const payments = db
      .prepare(
        `SELECT p.id, p.tariff_id, p.external_payment_id, p.amount, p.lessons_count, p.payment_method,
                p.status, p.confirmation_url, p.receipt_url,
                CASE WHEN p.receipt_file_path IS NOT NULL THEN 1 ELSE 0 END AS has_receipt_file,
                p.receipt_original_name, p.created_at, p.paid_at,
                t.title AS tariff_title
         FROM payments p
         LEFT JOIN tariffs t ON t.id = p.tariff_id
         WHERE p.family_id = ?
         ORDER BY p.created_at DESC, p.id DESC`
      )
      .all(family.id);

    const notifications = db
      .prepare(
        `SELECT id, title, message, is_read, created_at
         FROM notifications
         WHERE family_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 50`
      )
      .all(family.id) as Array<{
      id: number;
      title: string;
      message: string;
      is_read: number;
      created_at: string;
    }>;

    const unreadCount = notifications.filter((n) => n.is_read === 0).length;

    const tariffs = db
      .prepare('SELECT id, title, lessons_count, price, validity_days FROM tariffs WHERE is_active = 1 ORDER BY lessons_count ASC')
      .all();

    const settings = db
      .prepare(
        `SELECT free_cancel_hours, charge_on_miss, charge_on_late_cancel,
                show_hero_age, hero_age_text, show_hero_duration, hero_duration_text,
                show_hero_groups, hero_groups_text, show_hero_free_cancel
         FROM workshop_settings WHERE id = 1`
      )
      .get();

    const scheduleLessons = db
      .prepare(
        `SELECT l.id, l.title, l.lesson_type, l.start_time, l.duration_minutes,
                l.capacity, l.single_price, l.description,
                (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id = l.id AND b.status IN ('booked', 'attended')) AS booked_count,
                (SELECT COUNT(*) FROM waitlist w WHERE w.lesson_id = l.id AND w.status IN ('waiting', 'notified')) AS waitlist_count
         FROM lessons l
         WHERE l.is_canceled = 0 AND l.start_time >= datetime('now')
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
      booked_count: number;
      waitlist_count: number;
    }>;

    const familyReviews = db
      .prepare(
        `SELECT id, family_id, author_name, child_info, rating, text, is_published, created_at
         FROM reviews
         WHERE family_id = ?
         ORDER BY created_at DESC, id DESC`
      )
      .all(family.id);

    res.json({
      family: {
        id: family.id,
        parent_name: family.parent_name,
        phone: family.phone,
        money_balance: family.money_balance,
      },
      children,
      subscriptions,
      total_remaining_lessons: totalRemainingLessons,
      nearest_expiry: subscriptions[0]?.expires_at ?? null,
      bookings,
      waitlist: waitlistEntries,
      payments,
      notifications,
      unread_notifications_count: unreadCount,
      push_subscription_count: getPushSubscriptionCount(family.id),
      tariffs,
      settings,
      reviews: familyReviews,
      legal_documents: listLegalDocuments(),
      schedule: scheduleLessons.map((l) => ({
        ...l,
        free_spots: Math.max(0, l.capacity - l.booked_count),
      })),
    });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/bookings', parentActionLimiter, (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const lessonId = parsePositiveIntId(req.body?.lesson_id, 'Укажите корректный идентификатор занятия');
    const childId = parsePositiveIntId(req.body?.child_id, 'Укажите корректный идентификатор ребёнка');
    const isMakeup = Boolean(req.body?.is_makeup);

    const result = createBooking({
      lessonId,
      childId,
      isMakeup,
      familyIdConstraint: family.id,
    });

    res.status(201).json({ ok: true, booking_id: result.bookingId });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/waitlist', parentActionLimiter, (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const lessonId = parsePositiveIntId(req.body?.lesson_id, 'Укажите корректный идентификатор занятия');
    const childId = parsePositiveIntId(req.body?.child_id, 'Укажите корректный идентификатор ребёнка');

    const result = joinWaitlist({
      lessonId,
      childId,
      familyIdConstraint: family.id,
    });

    res.status(201).json({ ok: true, waitlist_id: result.waitlistId });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/bookings/:bookingId/cancel', parentActionLimiter, (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const bookingId = parsePositiveIntId(req.params.bookingId, 'Некорректный идентификатор записи');
    assertBookingBelongsToFamily(bookingId, family.id);
    const result = cancelBookingByParent(bookingId, family.id);
    res.json({ ok: true, charged: result.charged });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/payments', parentPaymentLimiter, async (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const tariffId = parsePositiveIntId(req.body?.tariff_id, 'Выберите тариф для оплаты');

    if (
      req.body?.accepted_offer !== true ||
      req.body?.accepted_personal_data !== true ||
      req.body?.accepted_privacy !== true
    ) {
      throw new HttpError(
        400,
        'Для перехода к оплате необходимо подтвердить согласие с договором-офертой, обработкой персональных данных и политикой конфиденциальности'
      );
    }

    const detectedBaseUrl = getSafeRequestOrigin(req);

    const payment = await createOnlinePaymentForTariff({
      familyId: family.id,
      familyToken: family.access_token,
      tariffId,
      baseUrl: detectedBaseUrl,
      consentedAt: new Date().toISOString(),
    });

    res.status(201).json({
      ok: true,
      payment_id: payment.paymentId,
      external_payment_id: payment.externalPaymentId,
      confirmation_url: payment.confirmationUrl,
    });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/payments/:paymentId/sync', parentPaymentLimiter, async (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const paymentId = parsePositiveIntId(req.params.paymentId, 'Некорректный идентификатор платежа');

    const db = getDb();
    const row = db
      .prepare('SELECT id, family_id, external_payment_id, status FROM payments WHERE id = ?')
      .get(paymentId) as
      | { id: number; family_id: number; external_payment_id: string | null; status: string }
      | undefined;

    if (!row || row.family_id !== family.id) {
      throw new HttpError(403, 'Доступ запрещён: платёж не принадлежит вашей семье');
    }
    if (!row.external_payment_id) {
      res.json({ ok: true, status: row.status, already_processed: row.status === 'succeeded' });
      return;
    }

    const result = await verifyAndApplyYooKassaPayment(row.external_payment_id);
    res.json({
      ok: true,
      status: result.status,
      already_processed: result.alreadyProcessed,
    });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/notifications/:notificationId/read', parentActionLimiter, (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const notificationId = parsePositiveIntId(
      req.params.notificationId,
      'Некорректный идентификатор уведомления'
    );
    assertNotificationBelongsToFamily(notificationId, family.id);
    markNotificationRead(notificationId, family.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/notifications/read-all', parentActionLimiter, (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    markAllNotificationsRead(family.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/reviews', parentReviewLimiter, (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const rating = Number(req.body?.rating);
    const text = String(req.body?.text ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim();
    const childInfoRaw = String(req.body?.child_info ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim()
      .slice(0, 120);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpError(400, 'Выберите оценку от 1 до 5');
    }
    if (text.length < 5 || text.length > 1000) {
      throw new HttpError(400, 'Текст отзыва должен содержать от 5 до 1000 символов');
    }

    const db = getDb();
    let childInfo = childInfoRaw || null;
    if (!childInfo) {
      const children = db
        .prepare('SELECT name, age FROM children WHERE family_id = ? ORDER BY id ASC')
        .all(family.id) as Array<{ name: string; age: number }>;
      if (children.length > 0) {
        childInfo = children.map((c) => `${c.name} (${c.age} лет)`).join(', ');
      }
    }

    const nowIso = new Date().toISOString();
    const resDb = db
      .prepare(
        `INSERT INTO reviews (family_id, author_name, child_info, rating, text, is_published, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`
      )
      .run(family.id, family.parent_name, childInfo, rating, text, nowIso);

    res.status(201).json({ ok: true, review_id: Number(resDb.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

parentRouter.get('/:token/push/vapid-public-key', (req, res, next) => {
  try {
    resolveFamilyByToken(req.params.token);
    res.json({ publicKey: getVapidPublicKey() });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/push/subscribe', (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const result = savePushSubscription(family.id, {
      endpoint: String(req.body?.endpoint ?? ''),
      keys: {
        p256dh: String(req.body?.keys?.p256dh ?? ''),
        auth: String(req.body?.keys?.auth ?? ''),
      },
    });
    res.status(201).json({ ok: true, count: result.count });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/push/unsubscribe', parentActionLimiter, (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const endpoint = String(req.body?.endpoint ?? '').trim();
    if (endpoint.length > 1000) {
      throw new HttpError(400, 'Некорректный адрес push-подписки');
    }
    const result = removePushSubscription(family.id, endpoint);
    res.json({ ok: true, count: result.count });
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/:token/push/test', parentPushTestLimiter, async (req, res, next) => {
  try {
    const family = resolveFamilyByToken(req.params.token);
    const title = 'Мастерская «Ясна» — проверка уведомлений';
    const message =
      'Push-уведомления работают! Сюда будут приходить чеки об оплате, подтверждения записи и напоминания перед занятиями.';
    createNotification(family.id, title, message);
    const delivery = await sendPushToFamily(family.id, {
      title,
      body: message,
      url: `/lk/${encodeURIComponent(family.access_token)}`,
      tag: 'yasna-test-push',
    });
    res.json({ ok: true, sent: delivery.sent, removed: delivery.removed });
  } catch (err) {
    next(err);
  }
});
