import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { config } from '../config.ts';
import { getDb, HttpError, runInTransaction } from '../db.ts';
import { createNotification } from './notificationService.ts';
import { createYooKassaPayment, fetchYooKassaPayment } from './yookassaService.ts';

interface TariffRow {
  id: number;
  title: string;
  lessons_count: number;
  price: number;
  validity_days: number;
  is_active: number;
}

interface PaymentRow {
  id: number;
  family_id: number;
  tariff_id: number | null;
  external_payment_id: string | null;
  amount: number;
  lessons_count: number;
  payment_method: 'yookassa' | 'cash' | 'transfer';
  status: 'pending' | 'succeeded' | 'canceled';
  confirmation_url: string | null;
  receipt_url: string | null;
  receipt_file_path: string | null;
  receipt_original_name: string | null;
}

function creditPaymentBenefit(db: DatabaseSync, payment: PaymentRow): void {
  const now = new Date();
  let validityDays = 45;
  let subTitle = `Абонемент (${payment.lessons_count} зан.)`;

  if (payment.tariff_id !== null) {
    const tariff = db
      .prepare('SELECT title, validity_days FROM tariffs WHERE id = ?')
      .get(payment.tariff_id) as { title: string; validity_days: number } | undefined;
    if (tariff) {
      validityDays = tariff.validity_days;
      subTitle = tariff.title;
    }
  }

  if (payment.lessons_count > 0) {
    const expires = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
    db.prepare(
      `INSERT INTO subscriptions (family_id, tariff_id, title, total_lessons, remaining_lessons, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      payment.family_id,
      payment.tariff_id,
      subTitle,
      payment.lessons_count,
      payment.lessons_count,
      expires.toISOString(),
      now.toISOString()
    );

    createNotification(
      payment.family_id,
      'Оплата подтверждена',
      `Зачислен тариф «${subTitle}» (+${payment.lessons_count} зан.) на сумму ${payment.amount.toFixed(0)} ₽.`,
      db
    );
  } else {
    db.prepare('UPDATE families SET money_balance = money_balance + ? WHERE id = ?').run(
      payment.amount,
      payment.family_id
    );
    createNotification(
      payment.family_id,
      'Баланс пополнен',
      `На денежный баланс семьи зачислено ${payment.amount.toFixed(0)} ₽.`,
      db
    );
  }
}

export async function createOnlinePaymentForTariff(params: {
  familyId: number;
  familyToken: string;
  tariffId: number;
  baseUrl?: string;
}): Promise<{ paymentId: number; externalPaymentId: string; confirmationUrl: string }> {
  const db = getDb();
  const tariff = db
    .prepare('SELECT id, title, lessons_count, price, validity_days, is_active FROM tariffs WHERE id = ? AND is_active = 1')
    .get(params.tariffId) as TariffRow | undefined;

  if (!tariff) {
    throw new HttpError(404, 'Выбранный тариф не найден или отключён');
  }
  if (tariff.price <= 0) {
    throw new HttpError(400, 'Стоимость тарифа должна быть больше 0');
  }

  const nowIso = new Date().toISOString();
  const insertResult = db
    .prepare(
      `INSERT INTO payments (family_id, tariff_id, external_payment_id, amount, lessons_count, payment_method, status, created_at)
       VALUES (?, ?, NULL, ?, ?, 'yookassa', 'pending', ?)`
    )
    .run(params.familyId, tariff.id, tariff.price, tariff.lessons_count, nowIso);

  const localPaymentId = Number(insertResult.lastInsertRowid);
  const origin = (params.baseUrl || config.appUrl).replace(/\/+$/, '');
  const returnUrl = `${origin}/lk/${encodeURIComponent(params.familyToken)}?payment_id=${localPaymentId}`;

  try {
    const remote = await createYooKassaPayment({
      amountRub: tariff.price,
      description: `${tariff.title} — Столярная мастерская «Ясна» (Сургут)`,
      returnUrl,
      metadata: {
        local_payment_id: String(localPaymentId),
        family_id: String(params.familyId),
        tariff_id: String(tariff.id),
      },
      idempotenceKey: `yasna-pay-${localPaymentId}-${crypto.randomUUID()}`,
    });

    const confirmationUrl = remote.confirmation?.confirmation_url;
    if (!confirmationUrl || !confirmationUrl.startsWith('https://')) {
      throw new HttpError(502, 'ЮKassa вернула некорректную ссылку для перехода к оплате');
    }

    db.prepare(
      `UPDATE payments
       SET external_payment_id = ?, confirmation_url = ?
       WHERE id = ?`
    ).run(remote.id, confirmationUrl, localPaymentId);

    return {
      paymentId: localPaymentId,
      externalPaymentId: remote.id,
      confirmationUrl,
    };
  } catch (err) {
    db.prepare("UPDATE payments SET status = 'canceled' WHERE id = ?").run(localPaymentId);
    throw err;
  }
}

export async function verifyAndApplyYooKassaPayment(
  externalPaymentId: string
): Promise<{ status: string; alreadyProcessed: boolean }> {
  if (!externalPaymentId || typeof externalPaymentId !== 'string') {
    throw new HttpError(400, 'Некорректный идентификатор платежа ЮKassa');
  }

  // Independent server-side verification against YooKassa API (prevents webhook spoofing)
  const remotePayment = await fetchYooKassaPayment(externalPaymentId);

  return runInTransaction((db) => {
    const localPayment = db
      .prepare('SELECT * FROM payments WHERE external_payment_id = ?')
      .get(externalPaymentId) as PaymentRow | undefined;

    if (!localPayment) {
      throw new HttpError(404, 'Платёж не найден в базе мастерской');
    }

    // Strict idempotency: never credit twice
    if (localPayment.status === 'succeeded') {
      return { status: 'succeeded', alreadyProcessed: true };
    }

    if (remotePayment.status === 'canceled') {
      db.prepare("UPDATE payments SET status = 'canceled' WHERE id = ?").run(localPayment.id);
      return { status: 'canceled', alreadyProcessed: false };
    }

    if (remotePayment.status !== 'succeeded') {
      return { status: remotePayment.status, alreadyProcessed: false };
    }

    const remoteAmount = Number(remotePayment.amount?.value ?? 0);
    if (!Number.isFinite(remoteAmount) || Math.abs(remoteAmount - localPayment.amount) >= 0.01) {
      throw new HttpError(409, 'Сумма платежа ЮKassa не совпадает с суммой заказа');
    }

    const nowIso = new Date().toISOString();
    const updateRes = db
      .prepare(
        `UPDATE payments
         SET status = 'succeeded', paid_at = ?
         WHERE id = ? AND status != 'succeeded'`
      )
      .run(nowIso, localPayment.id);

    if (updateRes.changes === 0) {
      return { status: 'succeeded', alreadyProcessed: true };
    }

    creditPaymentBenefit(db, localPayment);
    return { status: 'succeeded', alreadyProcessed: false };
  });
}

export function createManualPayment(params: {
  familyId: number;
  tariffId?: number | null;
  amount?: number;
  lessonsCount?: number;
  paymentMethod: 'cash' | 'transfer';
}): { paymentId: number } {
  return runInTransaction((db) => {
    const family = db.prepare('SELECT id FROM families WHERE id = ?').get(params.familyId) as
      | { id: number }
      | undefined;
    if (!family) {
      throw new HttpError(404, 'Семья не найдена');
    }

    let finalAmount = Number(params.amount ?? 0);
    let finalLessons = Number(params.lessonsCount ?? 0);
    let tariffId: number | null = null;

    if (params.tariffId) {
      const tariff = db
        .prepare('SELECT id, price, lessons_count FROM tariffs WHERE id = ?')
        .get(params.tariffId) as { id: number; price: number; lessons_count: number } | undefined;
      if (!tariff) {
        throw new HttpError(404, 'Тариф не найден');
      }
      tariffId = tariff.id;
      finalAmount = tariff.price;
      finalLessons = tariff.lessons_count;
    }

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      throw new HttpError(400, 'Сумма оплаты должна быть больше 0');
    }
    if (!Number.isInteger(finalLessons) || finalLessons < 0) {
      throw new HttpError(400, 'Количество занятий должно быть целым неотрицательным числом');
    }

    const nowIso = new Date().toISOString();
    const res = db
      .prepare(
        `INSERT INTO payments (family_id, tariff_id, external_payment_id, amount, lessons_count, payment_method, status, created_at, paid_at)
         VALUES (?, ?, NULL, ?, ?, ?, 'succeeded', ?, ?)`
      )
      .run(params.familyId, tariffId, finalAmount, finalLessons, params.paymentMethod, nowIso, nowIso);

    const paymentId = Number(res.lastInsertRowid);
    const createdPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as
      | PaymentRow
      | undefined;
    if (!createdPayment) {
      throw new HttpError(500, 'Не удалось прочитать созданный платёж');
    }
    creditPaymentBenefit(db, createdPayment);

    return { paymentId };
  });
}

export function attachReceiptUrl(paymentId: number, receiptUrl: string): void {
  const trimmed = receiptUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(400, 'Укажите корректную ссылку на чек из «Мой налог»');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, 'Ссылка на чек должна начинаться с https:// или http://');
  }

  const db = getDb();
  const payment = db
    .prepare('SELECT id, family_id, amount FROM payments WHERE id = ?')
    .get(paymentId) as { id: number; family_id: number; amount: number } | undefined;
  if (!payment) {
    throw new HttpError(404, 'Платёж не найден');
  }

  db.prepare('UPDATE payments SET receipt_url = ? WHERE id = ?').run(trimmed, paymentId);
  createNotification(
    payment.family_id,
    'Добавлен чек по оплате',
    `К оплате на сумму ${payment.amount.toFixed(0)} ₽ прикреплён чек из «Мой налог». Он доступен в разделе «Оплаты и чеки».`
  );
}

export function attachReceiptFile(
  paymentId: number,
  storedFilename: string,
  originalName: string
): void {
  const db = getDb();
  const payment = db
    .prepare('SELECT id, family_id, amount, receipt_file_path FROM payments WHERE id = ?')
    .get(paymentId) as { id: number; family_id: number; amount: number; receipt_file_path: string | null } | undefined;

  if (!payment) {
    // Clean up uploaded file if payment does not exist
    const fullPath = path.join(config.uploadsDir, path.basename(storedFilename));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    throw new HttpError(404, 'Платёж не найден');
  }

  if (payment.receipt_file_path) {
    const oldPath = path.join(config.uploadsDir, path.basename(payment.receipt_file_path));
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  db.prepare(
    'UPDATE payments SET receipt_file_path = ?, receipt_original_name = ? WHERE id = ?'
  ).run(path.basename(storedFilename), originalName, paymentId);

  createNotification(
    payment.family_id,
    'Загружен файл чека',
    `К оплате на сумму ${payment.amount.toFixed(0)} ₽ прикреплён файл чека из «Мой налог».`
  );
}
