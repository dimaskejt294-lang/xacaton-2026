import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HttpError as HttpErrorType } from '../src/server/db.ts';

const tempDbPath = path.join(os.tmpdir(), `yasna-test-booking-${Date.now()}.db`);
process.env.DATABASE_PATH = tempDbPath;

const { getDb, HttpError } = await import('../src/server/db.ts');
const { seedInitialDataIfEmpty } = await import('../src/server/seed.ts');
const {
  cancelBookingByParent,
  createBooking,
  getActiveLessonsRemaining,
  updateBookingStatusByMaster,
} = await import('../src/server/services/bookingService.ts');
const { createManualPayment } = await import('../src/server/services/paymentService.ts');

describe('Booking, capacity limits, attendance & configurable rules', () => {
  let family1Id = 0;
  let child1Id = 0;
  let child2Id = 0;
  let child3Id = 0;
  let lessonCap2Id = 0;
  let lessonSoonId = 0;

  beforeAll(() => {
    const db = getDb();
    seedInitialDataIfEmpty();

    const fam1 = db
      .prepare("SELECT id FROM families WHERE parent_name = 'Елена Смирнова'")
      .get() as { id: number };
    family1Id = fam1.id;

    const fam1Children = db
      .prepare('SELECT id FROM children WHERE family_id = ? ORDER BY id ASC')
      .all(family1Id) as Array<{ id: number }>;
    child1Id = fam1Children[0].id;
    child2Id = fam1Children[1].id;

    const fam2 = db
      .prepare("SELECT id FROM families WHERE parent_name = 'Алексей Иванов'")
      .get() as { id: number };
    const fam2Child = db
      .prepare('SELECT id FROM children WHERE family_id = ?')
      .get(fam2.id) as { id: number };
    child3Id = fam2Child.id;

    const lesson = db
      .prepare('SELECT id FROM lessons WHERE capacity = 2 LIMIT 1')
      .get() as { id: number };
    lessonCap2Id = lesson.id;

    // Create a lesson starting in 3 hours (inside 24h late-cancel window)
    const in3Hours = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    const resSoon = db
      .prepare(
        `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description)
         VALUES ('Срочное занятие', 'group', ?, 90, 4, 1200, 'Тест поздней отмены')`
      )
      .run(in3Hours);
    lessonSoonId = Number(resSoon.lastInsertRowid);
  });

  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(`${tempDbPath}${suffix}`)) {
        fs.unlinkSync(`${tempDbPath}${suffix}`);
      }
    }
  });

  it('enforces group capacity=2 and blocks duplicate or 3rd booking with 409', () => {
    const b1 = createBooking({ lessonId: lessonCap2Id, childId: child1Id, familyIdConstraint: family1Id });
    expect(b1.bookingId).toBeGreaterThan(0);

    // Duplicate booking for same child must fail
    expect(() =>
      createBooking({ lessonId: lessonCap2Id, childId: child1Id, familyIdConstraint: family1Id })
    ).toThrow(HttpError);

    // 2nd child fills capacity (2/2)
    const b2 = createBooking({ lessonId: lessonCap2Id, childId: child2Id, familyIdConstraint: family1Id });
    expect(b2.bookingId).toBeGreaterThan(0);

    // 3rd child must be rejected with 409 Conflict
    try {
      createBooking({ lessonId: lessonCap2Id, childId: child3Id });
      expect.unreachable('Expected capacity limit 409 error');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpErrorType).statusCode).toBe(409);
    }
  });

  it('deducts subscription from 4 to 3 on attended and refunds on correction', () => {
    const db = getDb();
    const subTariff = db
      .prepare('SELECT id FROM tariffs WHERE lessons_count = 4 LIMIT 1')
      .get() as { id: number };

    createManualPayment({
      familyId: family1Id,
      tariffId: subTariff.id,
      paymentMethod: 'cash',
    });

    expect(getActiveLessonsRemaining(db, family1Id)).toBe(4);

    const booking = db
      .prepare('SELECT id FROM bookings WHERE lesson_id = ? AND child_id = ?')
      .get(lessonCap2Id, child1Id) as { id: number };

    updateBookingStatusByMaster({
      bookingId: booking.id,
      newStatus: 'attended',
      reason: 'Пришёл на занятие',
    });

    expect(getActiveLessonsRemaining(db, family1Id)).toBe(3);

    const logRow = db
      .prepare('SELECT old_status, new_status FROM attendance_logs WHERE booking_id = ? ORDER BY id DESC LIMIT 1')
      .get(booking.id) as { old_status: string; new_status: string };
    expect(logRow).toEqual({ old_status: 'booked', new_status: 'attended' });

    // Correcting to canceled refunds the lesson back to 4
    updateBookingStatusByMaster({
      bookingId: booking.id,
      newStatus: 'canceled',
      reason: 'Ошибка отметки',
    });
    expect(getActiveLessonsRemaining(db, family1Id)).toBe(4);
  });

  it('applies configurable late-cancel charging rule', () => {
    const db = getDb();
    const before = getActiveLessonsRemaining(db, family1Id);
    const { bookingId } = createBooking({
      lessonId: lessonSoonId,
      childId: child1Id,
      familyIdConstraint: family1Id,
    });

    const cancelResult = cancelBookingByParent(bookingId, family1Id);
    expect(cancelResult.charged).toBe(true);
    expect(getActiveLessonsRemaining(db, family1Id)).toBe(before - 1);
  });
});
