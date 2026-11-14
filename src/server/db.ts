import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(config.databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }

  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.exec('PRAGMA journal_mode = DELETE;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');

  initializeSchema(db);
  dbInstance = db;
  return db;
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      access_token TEXT NOT NULL UNIQUE,
      money_balance REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_families_access_token ON families(access_token);

    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      age INTEGER NOT NULL CHECK(age >= 3 AND age <= 18),
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_children_family_id ON children(family_id);

    CREATE TABLE IF NOT EXISTS tariffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      lessons_count INTEGER NOT NULL CHECK(lessons_count >= 1),
      price REAL NOT NULL CHECK(price >= 0),
      validity_days INTEGER NOT NULL CHECK(validity_days >= 1),
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      tariff_id INTEGER REFERENCES tariffs(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      total_lessons INTEGER NOT NULL CHECK(total_lessons >= 1),
      remaining_lessons INTEGER NOT NULL CHECK(remaining_lessons >= 0),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_family_id ON subscriptions(family_id);

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      lesson_type TEXT NOT NULL CHECK(lesson_type IN ('group', 'individual')),
      start_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 90 CHECK(duration_minutes >= 15),
      capacity INTEGER NOT NULL CHECK(capacity >= 1),
      single_price REAL NOT NULL CHECK(single_price >= 0),
      description TEXT,
      is_canceled INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_start_time ON lessons(start_time);

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('booked', 'attended', 'missed', 'canceled')),
      is_charged INTEGER NOT NULL DEFAULT 0,
      charged_subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
      charge_amount REAL NOT NULL DEFAULT 0.0,
      is_makeup INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking_lesson_child
      ON bookings(lesson_id, child_id)
      WHERE status != 'canceled';

    CREATE INDEX IF NOT EXISTS idx_bookings_lesson_id ON bookings(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_child_id ON bookings(child_id);

    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('waiting', 'notified', 'converted', 'canceled')),
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_waitlist_lesson_child
      ON waitlist(lesson_id, child_id)
      WHERE status IN ('waiting', 'notified');

    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      old_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      reason TEXT,
      changed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_logs_booking_id ON attendance_logs(booking_id);

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      tariff_id INTEGER REFERENCES tariffs(id) ON DELETE SET NULL,
      external_payment_id TEXT UNIQUE,
      amount REAL NOT NULL CHECK(amount > 0),
      lessons_count INTEGER NOT NULL DEFAULT 0 CHECK(lessons_count >= 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('yookassa', 'cash', 'transfer')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'succeeded', 'canceled')),
      confirmation_url TEXT,
      receipt_url TEXT,
      receipt_file_path TEXT,
      receipt_original_name TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_payments_family_id ON payments(family_id);
    CREATE INDEX IF NOT EXISTS idx_payments_external_id ON payments(external_payment_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_family_id ON notifications(family_id);

    CREATE TABLE IF NOT EXISTS workshop_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      free_cancel_hours INTEGER NOT NULL DEFAULT 24 CHECK(free_cancel_hours >= 0),
      charge_on_miss INTEGER NOT NULL DEFAULT 1,
      charge_on_late_cancel INTEGER NOT NULL DEFAULT 1,
      master_password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      child_info TEXT,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      text TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_published ON reviews(is_published, created_at DESC);
  `);
}

export function runInTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback errors if transaction was already closed
    }
    throw err;
  }
}

export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'HttpError';
  }
}
