import type { DatabaseSync } from 'node:sqlite';
import { getDb, HttpError, runInTransaction } from '../db.ts';
import { createNotification } from './notificationService.ts';

export type BookingStatus = 'booked' | 'attended' | 'missed' | 'canceled';
export type LessonType = 'group' | 'masterclass' | 'individual' | 'birthday';

interface LessonRow {
  id: number;
  title: string;
  lesson_type: LessonType;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  single_price: number;
  is_canceled: number;
}

interface ChildWithFamilyRow {
  id: number;
  family_id: number;
  name: string;
}

interface SettingsRow {
  free_cancel_hours: number;
  charge_on_miss: number;
  charge_on_late_cancel: number;
}

interface SubscriptionRow {
  id: number;
  remaining_lessons: number;
  expires_at: string;
}

function getWorkshopSettings(db: DatabaseSync): SettingsRow {
  const row = db
    .prepare('SELECT free_cancel_hours, charge_on_miss, charge_on_late_cancel FROM workshop_settings WHERE id = 1')
    .get() as SettingsRow | undefined;
  return (
    row ?? {
      free_cancel_hours: 24,
      charge_on_miss: 1,
      charge_on_late_cancel: 1,
    }
  );
}

function formatDateRu(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getActiveLessonsRemaining(db: DatabaseSync, familyId: number): number {
  const nowIso = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(remaining_lessons), 0) AS total
       FROM subscriptions
       WHERE family_id = ? AND remaining_lessons > 0 AND expires_at > ?`
    )
    .get(familyId, nowIso) as { total: number };
  return row.total;
}

function deductOneLessonOrBalance(
  db: DatabaseSync,
  familyId: number,
  lessonPrice: number
): { subscriptionId: number | null; chargeAmount: number } {
  const nowIso = new Date().toISOString();
  const activeSub = db
    .prepare(
      `SELECT id, remaining_lessons, expires_at
       FROM subscriptions
       WHERE family_id = ? AND remaining_lessons > 0 AND expires_at > ?
       ORDER BY expires_at ASC, id ASC
       LIMIT 1`
    )
    .get(familyId, nowIso) as SubscriptionRow | undefined;

  if (activeSub) {
    db.prepare('UPDATE subscriptions SET remaining_lessons = remaining_lessons - 1 WHERE id = ?').run(
      activeSub.id
    );
    const remainingTotal = getActiveLessonsRemaining(db, familyId);
    if (remainingTotal <= 1) {
      createNotification(
        familyId,
        'Заканчивается абонемент',
        remainingTotal === 0
          ? 'На вашем абонементе не осталось доступных занятий. Вы можете продлить абонемент в разделе «Оплаты и чеки».'
          : 'На вашем абонементе осталось 1 занятие. Рекомендуем продлить абонемент заранее.',
        db
      );
    }
    return { subscriptionId: activeSub.id, chargeAmount: 0 };
  }

  db.prepare('UPDATE families SET money_balance = money_balance - ? WHERE id = ?').run(
    lessonPrice,
    familyId
  );
  return { subscriptionId: null, chargeAmount: lessonPrice };
}

function refundOneLessonOrBalance(
  db: DatabaseSync,
  familyId: number,
  chargedSubscriptionId: number | null,
  chargeAmount: number
): void {
  if (chargedSubscriptionId !== null) {
    const subExists = db
      .prepare('SELECT id FROM subscriptions WHERE id = ?')
      .get(chargedSubscriptionId) as { id: number } | undefined;
    if (subExists) {
      db.prepare('UPDATE subscriptions SET remaining_lessons = remaining_lessons + 1 WHERE id = ?').run(
        chargedSubscriptionId
      );
      return;
    }
  }
  if (chargeAmount > 0) {
    db.prepare('UPDATE families SET money_balance = money_balance + ? WHERE id = ?').run(
      chargeAmount,
      familyId
    );
  }
}

function notifyWaitlistIfSpotOpened(db: DatabaseSync, lesson: LessonRow): void {
  const activeCountRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM bookings
       WHERE lesson_id = ? AND status IN ('booked', 'attended')`
    )
    .get(lesson.id) as { cnt: number };

  if (activeCountRow.cnt >= lesson.capacity) {
    return;
  }

  const nextWaiter = db
    .prepare(
      `SELECT w.id, w.child_id, c.family_id, c.name AS child_name
       FROM waitlist w
       JOIN children c ON c.id = w.child_id
       WHERE w.lesson_id = ? AND w.status = 'waiting'
       ORDER BY w.created_at ASC, w.id ASC
       LIMIT 1`
    )
    .get(lesson.id) as { id: number; child_id: number; family_id: number; child_name: string } | undefined;

  if (!nextWaiter) {
    return;
  }

  db.prepare("UPDATE waitlist SET status = 'notified' WHERE id = ?").run(nextWaiter.id);
  createNotification(
    nextWaiter.family_id,
    'Освободилось место на занятие',
    `На занятие «${lesson.title}» (${formatDateRu(lesson.start_time)}) освободилось место. Вы можете записать ребёнка (${nextWaiter.child_name}) в расписании.`,
    db
  );
}

export function createBooking(params: {
  lessonId: number;
  childId: number;
  isMakeup?: boolean;
  familyIdConstraint?: number;
}): { bookingId: number } {
  return runInTransaction((db) => {
    const lesson = db
      .prepare(
        'SELECT id, title, lesson_type, start_time, duration_minutes, capacity, single_price, is_canceled FROM lessons WHERE id = ?'
      )
      .get(params.lessonId) as LessonRow | undefined;

    if (!lesson) {
      throw new HttpError(404, 'Занятие не найдено');
    }
    if (lesson.is_canceled) {
      throw new HttpError(409, 'Занятие было отменено мастером');
    }
    if (params.familyIdConstraint !== undefined && new Date(lesson.start_time).getTime() <= Date.now()) {
      throw new HttpError(400, 'Нельзя записаться на уже прошедшее занятие');
    }

    const child = db
      .prepare('SELECT id, family_id, name FROM children WHERE id = ?')
      .get(params.childId) as ChildWithFamilyRow | undefined;

    if (!child) {
      throw new HttpError(404, 'Профиль ребёнка не найден');
    }
    if (params.familyIdConstraint !== undefined && child.family_id !== params.familyIdConstraint) {
      throw new HttpError(403, 'Доступ запрещён: ребёнок не относится к вашей семье');
    }

    const existingBooking = db
      .prepare(
        `SELECT id FROM bookings
         WHERE lesson_id = ? AND child_id = ? AND status != 'canceled'`
      )
      .get(lesson.id, child.id) as { id: number } | undefined;

    if (existingBooking) {
      throw new HttpError(409, 'Ребёнок уже записан на это занятие');
    }

    const countRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM bookings
         WHERE lesson_id = ? AND status IN ('booked', 'attended')`
      )
      .get(lesson.id) as { cnt: number };

    if (countRow.cnt >= lesson.capacity) {
      throw new HttpError(409, 'Свободных мест в группе нет');
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO bookings (lesson_id, child_id, status, is_charged, charged_subscription_id, charge_amount, is_makeup, created_at, updated_at)
         VALUES (?, ?, 'booked', 0, NULL, 0.0, ?, ?, ?)`
      )
      .run(lesson.id, child.id, params.isMakeup ? 1 : 0, now, now);

    // Mark waitlist entry as converted if child was waiting for this lesson
    db.prepare(
      `UPDATE waitlist
       SET status = 'converted'
       WHERE lesson_id = ? AND child_id = ? AND status IN ('waiting', 'notified')`
    ).run(lesson.id, child.id);

    createNotification(
      child.family_id,
      'Запись подтверждена',
      `${child.name} записан(а) на занятие «${lesson.title}» (${formatDateRu(lesson.start_time)}).`,
      db
    );

    return { bookingId: Number(result.lastInsertRowid) };
  });
}

export function joinWaitlist(params: {
  lessonId: number;
  childId: number;
  familyIdConstraint?: number;
}): { waitlistId: number } {
  return runInTransaction((db) => {
    const lesson = db
      .prepare('SELECT id, title, start_time, is_canceled FROM lessons WHERE id = ?')
      .get(params.lessonId) as { id: number; title: string; start_time: string; is_canceled: number } | undefined;

    if (!lesson) {
      throw new HttpError(404, 'Занятие не найдено');
    }
    if (lesson.is_canceled) {
      throw new HttpError(409, 'Занятие отменено');
    }

    const child = db
      .prepare('SELECT id, family_id, name FROM children WHERE id = ?')
      .get(params.childId) as ChildWithFamilyRow | undefined;

    if (!child) {
      throw new HttpError(404, 'Ребёнок не найден');
    }
    if (params.familyIdConstraint !== undefined && child.family_id !== params.familyIdConstraint) {
      throw new HttpError(403, 'Доступ запрещён');
    }

    const alreadyBooked = db
      .prepare("SELECT id FROM bookings WHERE lesson_id = ? AND child_id = ? AND status != 'canceled'")
      .get(lesson.id, child.id);
    if (alreadyBooked) {
      throw new HttpError(409, 'Ребёнок уже записан на это занятие');
    }

    const alreadyWaiting = db
      .prepare(
        "SELECT id FROM waitlist WHERE lesson_id = ? AND child_id = ? AND status IN ('waiting', 'notified')"
      )
      .get(lesson.id, child.id);
    if (alreadyWaiting) {
      throw new HttpError(409, 'Ребёнок уже находится в листе ожидания на это занятие');
    }

    const now = new Date().toISOString();
    const res = db
      .prepare("INSERT INTO waitlist (lesson_id, child_id, status, created_at) VALUES (?, ?, 'waiting', ?)")
      .run(lesson.id, child.id, now);

    createNotification(
      child.family_id,
      'Добавлено в лист ожидания',
      `${child.name} добавлен(а) в лист ожидания на «${lesson.title}» (${formatDateRu(lesson.start_time)}). Мы сообщим в кабинете, если появится место.`,
      db
    );

    return { waitlistId: Number(res.lastInsertRowid) };
  });
}

export function cancelBookingByParent(bookingId: number, familyId: number): { charged: boolean } {
  return runInTransaction((db) => {
    const booking = db
      .prepare(
        `SELECT b.id, b.lesson_id, b.child_id, b.status, b.is_charged, c.family_id, c.name AS child_name,
                l.title AS lesson_title, l.lesson_type, l.start_time, l.duration_minutes, l.capacity, l.single_price, l.is_canceled
         FROM bookings b
         JOIN children c ON c.id = b.child_id
         JOIN lessons l ON l.id = b.lesson_id
         WHERE b.id = ?`
      )
      .get(bookingId) as
      | (LessonRow & {
          id: number;
          lesson_id: number;
          child_id: number;
          status: BookingStatus;
          is_charged: number;
          family_id: number;
          child_name: string;
          lesson_title: string;
        })
      | undefined;

    if (!booking) {
      throw new HttpError(404, 'Запись не найдена');
    }
    if (booking.family_id !== familyId) {
      throw new HttpError(403, 'Доступ запрещён: запись не принадлежит вашей семье');
    }
    if (booking.status !== 'booked') {
      throw new HttpError(409, 'Отменить можно только активную предстоящую запись');
    }

    const settings = getWorkshopSettings(db);
    const hoursUntilLesson = (new Date(booking.start_time).getTime() - Date.now()) / (1000 * 60 * 60);
    const isLateCancel = hoursUntilLesson < settings.free_cancel_hours;
    const shouldCharge = isLateCancel && settings.charge_on_late_cancel === 1;

    let chargedSubId: number | null = null;
    let chargeAmount = 0;

    if (shouldCharge && booking.is_charged === 0) {
      const deducted = deductOneLessonOrBalance(db, familyId, booking.single_price);
      chargedSubId = deducted.subscriptionId;
      chargeAmount = deducted.chargeAmount;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE bookings
       SET status = 'canceled',
           is_charged = ?,
           charged_subscription_id = ?,
           charge_amount = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(shouldCharge ? 1 : 0, chargedSubId, chargeAmount, now, booking.id);

    db.prepare(
      `INSERT INTO attendance_logs (booking_id, old_status, new_status, reason, changed_at)
       VALUES (?, ?, 'canceled', ?, ?)`
    ).run(
      booking.id,
      booking.status,
      shouldCharge ? 'Поздняя отмена родителем (со списанием)' : 'Отмена родителем в бесплатный срок',
      now
    );

    createNotification(
      familyId,
      'Запись отменена',
      shouldCharge
        ? `Запись ребёнка ${booking.child_name} на «${booking.lesson_title}» отменена менее чем за ${settings.free_cancel_hours} ч. Занятие списано по правилам мастерской.`
        : `Запись ребёнка ${booking.child_name} на «${booking.lesson_title}» отменена без списания.`,
      db
    );

    notifyWaitlistIfSpotOpened(db, {
      id: booking.lesson_id,
      title: booking.lesson_title,
      lesson_type: booking.lesson_type,
      start_time: booking.start_time,
      duration_minutes: booking.duration_minutes,
      capacity: booking.capacity,
      single_price: booking.single_price,
      is_canceled: booking.is_canceled,
    });

    return { charged: shouldCharge };
  });
}

export function updateBookingStatusByMaster(params: {
  bookingId: number;
  newStatus: BookingStatus;
  reason?: string;
}): void {
  runInTransaction((db) => {
    const booking = db
      .prepare(
        `SELECT b.id, b.lesson_id, b.child_id, b.status, b.is_charged, b.charged_subscription_id, b.charge_amount,
                c.family_id, c.name AS child_name,
                l.title AS lesson_title, l.lesson_type, l.start_time, l.duration_minutes, l.capacity, l.single_price, l.is_canceled
         FROM bookings b
         JOIN children c ON c.id = b.child_id
         JOIN lessons l ON l.id = b.lesson_id
         WHERE b.id = ?`
      )
      .get(params.bookingId) as
      | (LessonRow & {
          id: number;
          lesson_id: number;
          child_id: number;
          status: BookingStatus;
          is_charged: number;
          charged_subscription_id: number | null;
          charge_amount: number;
          family_id: number;
          child_name: string;
          lesson_title: string;
        })
      | undefined;

    if (!booking) {
      throw new HttpError(404, 'Запись не найдена');
    }

    if (booking.status === params.newStatus) {
      return;
    }

    const settings = getWorkshopSettings(db);
    const shouldBeCharged =
      params.newStatus === 'attended' ||
      (params.newStatus === 'missed' && settings.charge_on_miss === 1);

    let nextIsCharged = booking.is_charged;
    let nextSubId = booking.charged_subscription_id;
    let nextChargeAmount = booking.charge_amount;

    if (shouldBeCharged && booking.is_charged === 0) {
      const deducted = deductOneLessonOrBalance(db, booking.family_id, booking.single_price);
      nextIsCharged = 1;
      nextSubId = deducted.subscriptionId;
      nextChargeAmount = deducted.chargeAmount;
    } else if (!shouldBeCharged && booking.is_charged === 1) {
      refundOneLessonOrBalance(
        db,
        booking.family_id,
        booking.charged_subscription_id,
        booking.charge_amount
      );
      nextIsCharged = 0;
      nextSubId = null;
      nextChargeAmount = 0;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE bookings
       SET status = ?,
           is_charged = ?,
           charged_subscription_id = ?,
           charge_amount = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(params.newStatus, nextIsCharged, nextSubId, nextChargeAmount, now, booking.id);

    db.prepare(
      `INSERT INTO attendance_logs (booking_id, old_status, new_status, reason, changed_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(booking.id, booking.status, params.newStatus, params.reason?.trim() || 'Изменено мастером', now);

    if (params.newStatus === 'attended') {
      createNotification(
        booking.family_id,
        'Посещение отмечено',
        nextChargeAmount > 0
          ? `${booking.child_name} посетил(а) занятие «${booking.lesson_title}» (${formatDateRu(
              booking.start_time
            )}). Начислено за разовое занятие: ${nextChargeAmount.toFixed(0)} ₽.`
          : `${booking.child_name} посетил(а) занятие «${booking.lesson_title}» (${formatDateRu(
              booking.start_time
            )}). Отметка сохранена в журнале.`,
        db
      );
    } else if (params.newStatus === 'missed') {
      createNotification(
        booking.family_id,
        'Отмечен пропуск занятия',
        shouldBeCharged
          ? `${booking.child_name} не пришёл(а) на занятие «${booking.lesson_title}» (${formatDateRu(
              booking.start_time
            )}). Занятие списано по правилам мастерской.`
          : `${booking.child_name} не пришёл(а) на занятие «${booking.lesson_title}» (${formatDateRu(
              booking.start_time
            )}). Занятие не списано.`,
        db
      );
    } else if (params.newStatus === 'canceled') {
      createNotification(
        booking.family_id,
        'Запись отменена мастером',
        `Запись ребёнка ${booking.child_name} на «${booking.lesson_title}» (${formatDateRu(
          booking.start_time
        )}) отменена.`,
        db
      );
      notifyWaitlistIfSpotOpened(db, {
        id: booking.lesson_id,
        title: booking.lesson_title,
        lesson_type: booking.lesson_type,
        start_time: booking.start_time,
        duration_minutes: booking.duration_minutes,
        capacity: booking.capacity,
        single_price: booking.single_price,
        is_canceled: booking.is_canceled,
      });
    }
  });
}

export function getFreeSpotsForLesson(db: DatabaseSync, lessonId: number, capacity: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS cnt FROM bookings WHERE lesson_id = ? AND status IN ('booked', 'attended')")
    .get(lessonId) as { cnt: number };
  return Math.max(0, capacity - row.cnt);
}
