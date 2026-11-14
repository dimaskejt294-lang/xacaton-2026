import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.ts';
import { getDb, HttpError, runInTransaction } from '../db.ts';
import { generateAccessToken } from '../security.ts';

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  let sanitized = raw.replace(/\r?\n/g, ' ');
  // Prevent CSV Formula Injection while keeping normal phone numbers (+7...) and negative numbers (-1200.00) intact
  if (/^[=@\t\r]/.test(sanitized) || /^[+-][A-Za-z=]/.test(sanitized)) {
    sanitized = `'${sanitized}`;
  }
  if (sanitized.includes(';') || sanitized.includes('"') || sanitized.startsWith("'")) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(';')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function exportClientsCsv(): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT f.id, f.parent_name, f.phone, f.money_balance, f.created_at,
              COALESCE(GROUP_CONCAT(c.name || ' (' || c.age || ' л.)', ', '), '') AS children_list,
              COALESCE((SELECT SUM(s.remaining_lessons) FROM subscriptions s WHERE s.family_id = f.id AND s.remaining_lessons > 0 AND s.expires_at > datetime('now')), 0) AS remaining_lessons
       FROM families f
       LEFT JOIN children c ON c.family_id = f.id
       GROUP BY f.id
       ORDER BY f.id ASC`
    )
    .all() as Array<{
    id: number;
    parent_name: string;
    phone: string;
    money_balance: number;
    created_at: string;
    children_list: string;
    remaining_lessons: number;
  }>;

  return toCsv(
    ['ID', 'Родитель', 'Телефон', 'Дети', 'Остаток занятий', 'Денежный баланс (₽)', 'Дата регистрации'],
    rows.map((r) => [
      r.id,
      r.parent_name,
      r.phone,
      r.children_list,
      r.remaining_lessons,
      r.money_balance.toFixed(2),
      r.created_at,
    ])
  );
}

export function exportAttendanceCsv(): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT b.id, l.title AS lesson_title, l.start_time, l.lesson_type,
              c.name AS child_name, f.parent_name, b.status, b.is_charged, b.updated_at
       FROM bookings b
       JOIN lessons l ON l.id = b.lesson_id
       JOIN children c ON c.id = b.child_id
       JOIN families f ON f.id = c.family_id
       ORDER BY l.start_time DESC, b.id DESC`
    )
    .all() as Array<{
    id: number;
    lesson_title: string;
    start_time: string;
    lesson_type: string;
    child_name: string;
    parent_name: string;
    status: string;
    is_charged: number;
    updated_at: string;
  }>;

  return toCsv(
    ['ID записи', 'Занятие', 'Дата и время', 'Формат', 'Ребёнок', 'Родитель', 'Статус', 'Списано', 'Обновлено'],
    rows.map((r) => [
      r.id,
      r.lesson_title,
      r.start_time,
      r.lesson_type === 'group' ? 'Групповое' : 'Индивидуальное',
      r.child_name,
      r.parent_name,
      r.status,
      r.is_charged ? 'Да' : 'Нет',
      r.updated_at,
    ])
  );
}

export function exportPaymentsCsv(): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id, f.parent_name, f.phone, p.amount, p.lessons_count, p.payment_method,
              p.status, p.external_payment_id, p.receipt_url, p.created_at, p.paid_at
       FROM payments p
       JOIN families f ON f.id = p.family_id
       ORDER BY p.created_at DESC, p.id DESC`
    )
    .all() as Array<{
    id: number;
    parent_name: string;
    phone: string;
    amount: number;
    lessons_count: number;
    payment_method: string;
    status: string;
    external_payment_id: string | null;
    receipt_url: string | null;
    created_at: string;
    paid_at: string | null;
  }>;

  return toCsv(
    [
      'ID платежа',
      'Родитель',
      'Телефон',
      'Сумма (₽)',
      'Занятий',
      'Способ',
      'Статус',
      'ID ЮKassa',
      'Ссылка на чек',
      'Создан',
      'Оплачен',
    ],
    rows.map((r) => [
      r.id,
      r.parent_name,
      r.phone,
      r.amount.toFixed(2),
      r.lessons_count,
      r.payment_method,
      r.status,
      r.external_payment_id ?? '',
      r.receipt_url ?? '',
      r.created_at,
      r.paid_at ?? '',
    ])
  );
}

export function createDatabaseBackupFile(): { filePath: string; cleanup: () => void } {
  const db = getDb();
  const tmpFile = path.join(os.tmpdir(), `yasna-backup-${crypto.randomUUID()}.db`);
  if (fs.existsSync(tmpFile)) {
    fs.unlinkSync(tmpFile);
  }
  db.prepare('VACUUM INTO ?').run(tmpFile);
  return {
    filePath: tmpFile,
    cleanup: () => {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    },
  };
}

export function importClientsFromCsv(csvText: string): { importedFamilies: number; importedChildren: number } {
  if (csvText.length > 100_000) {
    throw new HttpError(400, 'Размер CSV-текста не должен превышать 100 КБ');
  }

  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new HttpError(400, 'CSV-текст пустой');
  }
  if (lines.length > 500) {
    throw new HttpError(400, 'За один импорт можно загрузить не более 500 строк');
  }

  return runInTransaction((db) => {
    let importedFamilies = 0;
    let importedChildren = 0;
    const now = new Date();

    for (let i = 0; i < lines.length; i += 1) {
      const separator = lines[i].includes(';') ? ';' : ',';
      const cols = lines[i].split(separator).map((c) => c.trim().replace(/^"|"$/g, ''));

      // Skip header row if detected
      if (i === 0 && /родител|фио|parent/i.test(cols[0] ?? '')) {
        continue;
      }

      const parentName = cols[0];
      const phone = cols[1] || '+7 (922) 000-00-00';
      const childName = cols[2];
      const childAgeRaw = Number(cols[3] || 9);
      const lessonsRaw = Number(cols[4] || 0);

      if (!parentName || !childName) {
        continue;
      }

      const childAge = Number.isFinite(childAgeRaw) && childAgeRaw >= 3 && childAgeRaw <= 18 ? Math.round(childAgeRaw) : 9;

      let family = db
        .prepare('SELECT id FROM families WHERE parent_name = ? AND phone = ?')
        .get(parentName, phone) as { id: number } | undefined;

      if (!family) {
        const token = generateAccessToken();
        const famRes = db
          .prepare(
            'INSERT INTO families (parent_name, phone, access_token, money_balance, created_at) VALUES (?, ?, ?, 0, ?)'
          )
          .run(parentName, phone, token, now.toISOString());
        family = { id: Number(famRes.lastInsertRowid) };
        importedFamilies += 1;

        if (Number.isInteger(lessonsRaw) && lessonsRaw > 0) {
          const expires = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
          db.prepare(
            `INSERT INTO subscriptions (family_id, tariff_id, title, total_lessons, remaining_lessons, expires_at, created_at)
             VALUES (?, NULL, 'Импорт из МойКласс', ?, ?, ?, ?)`
          ).run(family.id, lessonsRaw, lessonsRaw, expires.toISOString(), now.toISOString());
        }
      }

      db.prepare('INSERT INTO children (family_id, name, age, notes) VALUES (?, ?, ?, ?)').run(
        family.id,
        childName,
        childAge,
        'Импортировано из CSV'
      );
      importedChildren += 1;
    }

    if (importedChildren === 0) {
      throw new HttpError(400, 'Не удалось распознать строки импорта. Ожидаемый формат: Родитель;Телефон;Ребёнок;Возраст;Остаток');
    }

    return { importedFamilies, importedChildren };
  });
}

export function getDatabaseFileSizeBytes(): number {
  if (!fs.existsSync(config.databasePath)) {
    return 0;
  }
  return fs.statSync(config.databasePath).size;
}
