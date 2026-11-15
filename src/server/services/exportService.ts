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
      r.lesson_type === 'group'
        ? 'Группа'
        : r.lesson_type === 'masterclass'
          ? 'Мастер-класс'
          : r.lesson_type === 'birthday'
            ? 'День рождения'
            : 'Индивидуальное',
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

export interface MoyKlassImportRow {
  child_name?: string;
  parent_name?: string;
  phone?: string;
  email?: string;
  max_contact?: string;
  age?: string | number;
  remaining_lessons?: string | number;
  money_balance?: string | number;
}

function parseAgeOrBirthDate(raw: string | number | undefined): number {
  if (raw === undefined || raw === null) return 10;
  const str = String(raw).trim();
  if (!str) return 10;
  const num = Number(str.replace(/[^\d.]/g, ''));
  if (/^\d{1,2}$/.test(str) && num >= 3 && num <= 99) {
    return Math.round(num);
  }
  // Check DD.MM.YYYY or YYYY-MM-DD birth date from MoyKlass export
  const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmyMatch) {
    const birthYear = Number(dmyMatch[3]);
    const age = new Date().getFullYear() - birthYear;
    if (age >= 3 && age <= 99) return age;
  }
  const ymdMatch = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (ymdMatch) {
    const birthYear = Number(ymdMatch[1]);
    const age = new Date().getFullYear() - birthYear;
    if (age >= 3 && age <= 99) return age;
  }
  if (Number.isFinite(num) && num >= 3 && num <= 99) {
    return Math.round(num);
  }
  return 10;
}

function splitTableLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
}

export function importClientsFromCsv(
  csvText: string,
  structuredRows?: MoyKlassImportRow[]
): { importedFamilies: number; importedChildren: number } {
  const parsedRows: Array<{
    parentName: string;
    childName: string;
    phone: string;
    email: string;
    maxContact: string;
    childAge: number;
    lessons: number;
    balance: number;
  }> = [];

  if (Array.isArray(structuredRows) && structuredRows.length > 0) {
    if (structuredRows.length > 500) {
      throw new HttpError(400, 'За один импорт можно загрузить не более 500 строк');
    }
    for (const r of structuredRows) {
      const rawChild = String(r.child_name ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 80);
      const rawParent = String(r.parent_name ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);
      const childName = rawChild || rawParent;
      const parentName = rawParent || rawChild;
      const phone = String(r.phone ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 30);
      const email = String(r.email ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);
      const maxContact = String(r.max_contact ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);
      const childAge = parseAgeOrBirthDate(r.age);
      const lessonsNum = Number(String(r.remaining_lessons ?? '0').replace(/[^\d-]/g, ''));
      const balanceNum = Number(String(r.money_balance ?? '0').replace(',', '.').replace(/[^\d.-]/g, ''));
      if (!childName || phone.length < 5) continue;
      parsedRows.push({
        parentName,
        childName,
        phone,
        email,
        maxContact,
        childAge,
        lessons: Number.isFinite(lessonsNum) && lessonsNum > 0 ? Math.round(lessonsNum) : 0,
        balance: Number.isFinite(balanceNum) ? balanceNum : 0,
      });
    }
  } else {
    if (csvText.length > 100_000) {
      throw new HttpError(400, 'Размер таблицы не должен превышать 100 КБ');
    }

    const lines = csvText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      throw new HttpError(400, 'Таблица для импорта пуста');
    }
    if (lines.length > 500) {
      throw new HttpError(400, 'За один импорт можно загрузить не более 500 строк');
    }

    const firstCols = splitTableLine(lines[0]);
    const hasHeader = firstCols.some((c) =>
      /фио|имя|ученик|клиент|родител|заказчик|телефон|phone|email|почта|возраст|рожд|остаток|абонем|баланс/i.test(
        c
      )
    );

    let idxChild = -1;
    let idxParent = -1;
    let idxPhone = -1;
    let idxEmail = -1;
    let idxMax = -1;
    let idxAge = -1;
    let idxLessons = -1;
    let idxBalance = -1;

    if (hasHeader) {
      firstCols.forEach((col, idx) => {
        const h = col.toLowerCase();
        if (idxChild === -1 && /ученик|реб[её]нок|клиент|фио|имя/.test(h) && !/родител|заказчик|ответствен/.test(h)) {
          idxChild = idx;
        } else if (idxParent === -1 && /родител|заказчик|ответствен|контакт/.test(h)) {
          idxParent = idx;
        } else if (idxPhone === -1 && /телефон|phone|моб|номер/.test(h) && !/max|макс/.test(h)) {
          idxPhone = idx;
        } else if (idxEmail === -1 && /email|e-mail|почт|mail/.test(h)) {
          idxEmail = idx;
        } else if (idxMax === -1 && /max|макс|мессендж|коммент|примеч/.test(h)) {
          idxMax = idx;
        } else if (idxAge === -1 && /возраст|рожд|age|лет/.test(h)) {
          idxAge = idx;
        } else if (idxLessons === -1 && /остаток|занят|абонем|уроков/.test(h)) {
          idxLessons = idx;
        } else if (idxBalance === -1 && /баланс|долг|сумма|деньг/.test(h)) {
          idxBalance = idx;
        }
      });
    }

    const startLine = hasHeader ? 1 : 0;
    for (let i = startLine; i < lines.length; i += 1) {
      const cols = splitTableLine(lines[i]);
      if (cols.every((c) => !c)) continue;

      let parentName = '';
      let childName = '';
      let phone = '';
      let email = '';
      let maxContact = '';
      let ageVal: string | number = 10;
      let lessonsVal = 0;
      let balanceVal = 0;

      if (hasHeader && (idxChild !== -1 || idxParent !== -1 || idxPhone !== -1)) {
        childName = idxChild !== -1 ? (cols[idxChild] ?? '') : '';
        parentName = idxParent !== -1 ? (cols[idxParent] ?? '') : '';
        if (!childName && parentName) childName = parentName;
        if (!parentName && childName) parentName = childName;
        phone = idxPhone !== -1 ? (cols[idxPhone] ?? '') : '';
        email = idxEmail !== -1 ? (cols[idxEmail] ?? '') : '';
        maxContact = idxMax !== -1 ? (cols[idxMax] ?? '') : '';
        ageVal = idxAge !== -1 ? (cols[idxAge] ?? '10') : '10';
        lessonsVal = idxLessons !== -1 ? Number((cols[idxLessons] ?? '0').replace(/[^\d-]/g, '')) : 0;
        balanceVal =
          idxBalance !== -1
            ? Number((cols[idxBalance] ?? '0').replace(',', '.').replace(/[^\d.-]/g, ''))
            : 0;
      } else {
        // Positional fallback: supports both:
        // 1) Classic 5-col: Родитель ; Телефон ; Имя ребёнка ; Возраст ; Остаток
        // 2) MoyKlass table row: ФИО ученика ; Телефон ; Почта ; MAX ; Возраст ; Остаток
        const col2LooksLikeEmail = (cols[2] ?? '').includes('@');
        if (col2LooksLikeEmail || cols.length >= 6) {
          childName = cols[0] ?? '';
          parentName = cols[0] ?? '';
          phone = cols[1] ?? '';
          email = cols[2] ?? '';
          maxContact = cols[3] ?? '';
          ageVal = cols[4] ?? '10';
          lessonsVal = Number((cols[5] ?? '0').replace(/[^\d-]/g, ''));
        } else {
          parentName = cols[0] ?? '';
          phone = cols[1] ?? '';
          childName = cols[2] || cols[0] || '';
          ageVal = cols[3] ?? '9';
          lessonsVal = Number((cols[4] ?? '0').replace(/[^\d-]/g, ''));
        }
      }

      parentName = parentName.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);
      childName = childName.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 80);
      phone = phone.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 30);
      email = email.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);
      maxContact = maxContact.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);

      if ((!childName && !parentName) || phone.length < 5) continue;
      if (!childName) childName = parentName;
      if (!parentName) parentName = childName;

      parsedRows.push({
        parentName,
        childName,
        phone,
        email,
        maxContact,
        childAge: parseAgeOrBirthDate(ageVal),
        lessons: Number.isFinite(lessonsVal) && lessonsVal > 0 ? Math.round(lessonsVal) : 0,
        balance: Number.isFinite(balanceVal) ? balanceVal : 0,
      });
    }
  }

  if (parsedRows.length === 0) {
    throw new HttpError(
      400,
      'Не удалось распознать строки таблицы «МойКласс». Проверьте, что указано хотя бы ФИО ученика.'
    );
  }

  return runInTransaction((db) => {
    let importedFamilies = 0;
    let importedChildren = 0;
    const now = new Date();

    for (const row of parsedRows) {
      let family = db
        .prepare('SELECT id FROM families WHERE parent_name = ? AND phone = ?')
        .get(row.parentName, row.phone) as { id: number } | undefined;

      if (!family) {
        const token = generateAccessToken();
        const famRes = db
          .prepare(
            'INSERT INTO families (parent_name, phone, email, max_contact, access_token, money_balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            row.parentName,
            row.phone,
            row.email,
            row.maxContact,
            token,
            row.balance,
            now.toISOString()
          );
        family = { id: Number(famRes.lastInsertRowid) };
        importedFamilies += 1;

        if (row.lessons > 0) {
          const expires = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
          db.prepare(
            `INSERT INTO subscriptions (family_id, tariff_id, title, total_lessons, remaining_lessons, expires_at, created_at)
             VALUES (?, NULL, 'Импорт из МойКласс', ?, ?, ?, ?)`
          ).run(family.id, row.lessons, row.lessons, expires.toISOString(), now.toISOString());
        }
      } else if (row.email || row.maxContact) {
        db.prepare(
          `UPDATE families
           SET email = CASE WHEN ? != '' THEN ? ELSE email END,
               max_contact = CASE WHEN ? != '' THEN ? ELSE max_contact END
           WHERE id = ?`
        ).run(row.email, row.email, row.maxContact, row.maxContact, family.id);
      }

      db.prepare('INSERT INTO children (family_id, name, age, notes) VALUES (?, ?, ?, ?)').run(
        family.id,
        row.childName,
        row.childAge,
        'Импортировано из МойКласс'
      );
      importedChildren += 1;
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
