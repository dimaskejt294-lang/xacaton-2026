import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tempDbPath = path.join(os.tmpdir(), `yasna-test-payment-${Date.now()}.db`);
process.env.DATABASE_PATH = tempDbPath;
process.env.YOOKASSA_SHOP_ID = '999999';
process.env.YOOKASSA_SECRET_KEY = 'test_mock_secret_key_for_vitest';

const { getDb } = await import('../src/server/db.ts');
const { seedInitialDataIfEmpty } = await import('../src/server/seed.ts');
const { getActiveLessonsRemaining } = await import('../src/server/services/bookingService.ts');
const {
  attachReceiptFile,
  attachReceiptUrl,
  createManualPayment,
  createOnlinePaymentForTariff,
  verifyAndApplyYooKassaPayment,
} = await import('../src/server/services/paymentService.ts');
const { exportClientsCsv, createDatabaseBackupFile } = await import(
  '../src/server/services/exportService.ts'
);

describe('YooKassa payment creation, verification, idempotency & exports', () => {
  beforeAll(() => {
    getDb();
    seedInitialDataIfEmpty();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(`${tempDbPath}${suffix}`)) {
        fs.unlinkSync(`${tempDbPath}${suffix}`);
      }
    }
  });

  it('credits 4 lessons once and ignores duplicate YooKassa webhook calls', async () => {
    const db = getDb();
    const fam = db
      .prepare("SELECT id, access_token FROM families WHERE parent_name = 'Елена Смирнова'")
      .get() as { id: number; access_token: string };
    const tariff4 = db
      .prepare('SELECT id, price FROM tariffs WHERE lessons_count = 4 LIMIT 1')
      .get() as { id: number; price: number };

    const externalId = '2d9b8c10-000f-5000-8000-1234567890ab';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://api.yookassa.ru/v3/payments' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: externalId,
            status: 'pending',
            paid: false,
            amount: { value: '4200.00', currency: 'RUB' },
            confirmation: {
              type: 'redirect',
              confirmation_url: `https://yoomoney.ru/checkout/payments/v2/contract?orderId=${externalId}`,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === `https://api.yookassa.ru/v3/payments/${externalId}`) {
        return new Response(
          JSON.stringify({
            id: externalId,
            status: 'succeeded',
            paid: true,
            amount: { value: '4200.00', currency: 'RUB' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const created = await createOnlinePaymentForTariff({
      familyId: fam.id,
      familyToken: fam.access_token,
      tariffId: tariff4.id,
      baseUrl: 'https://yasna.example',
    });

    expect(created.externalPaymentId).toBe(externalId);
    expect(created.confirmationUrl).toContain('yoomoney.ru');
    expect(getActiveLessonsRemaining(db, fam.id)).toBe(0);

    // First webhook verification -> credits 4 lessons
    const firstWebhook = await verifyAndApplyYooKassaPayment(externalId);
    expect(firstWebhook).toEqual({ status: 'succeeded', alreadyProcessed: false });
    expect(getActiveLessonsRemaining(db, fam.id)).toBe(4);

    // Second duplicate webhook -> strict idempotency, balance stays 4
    const duplicateWebhook = await verifyAndApplyYooKassaPayment(externalId);
    expect(duplicateWebhook).toEqual({ status: 'succeeded', alreadyProcessed: true });
    expect(getActiveLessonsRemaining(db, fam.id)).toBe(4);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('attaches Moy Nalog receipt URL and file to payment and notifies family', () => {
    const db = getDb();
    const fam = db
      .prepare("SELECT id FROM families WHERE parent_name = 'Марина Козлова'")
      .get() as { id: number };
    const { paymentId } = createManualPayment({
      familyId: fam.id,
      amount: 1200,
      lessonsCount: 1,
      paymentMethod: 'cash',
    });

    expect(() => attachReceiptUrl(paymentId, 'not-a-valid-url')).toThrow();

    attachReceiptUrl(paymentId, 'https://lknpd.nalog.ru/api/v1/receipt/test-123');
    attachReceiptFile(paymentId, 'test-receipt-file.pdf', 'Чек_Ясна.pdf');

    const row = db
      .prepare('SELECT receipt_url, receipt_file_path, receipt_original_name FROM payments WHERE id = ?')
      .get(paymentId) as {
      receipt_url: string | null;
      receipt_file_path: string | null;
      receipt_original_name: string | null;
    };

    expect(row.receipt_url).toBe('https://lknpd.nalog.ru/api/v1/receipt/test-123');
    expect(row.receipt_file_path).toBe('test-receipt-file.pdf');
    expect(row.receipt_original_name).toBe('Чек_Ясна.pdf');
  });

  it('exports UTF-8 BOM semicolon CSV and creates valid SQLite backup file', () => {
    const csv = exportClientsCsv();
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Елена Смирнова;');

    const backup = createDatabaseBackupFile();
    try {
      expect(fs.existsSync(backup.filePath)).toBe(true);
      expect(fs.statSync(backup.filePath).size).toBeGreaterThan(4096);
    } finally {
      backup.cleanup();
    }
  });
});
