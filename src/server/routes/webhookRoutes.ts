import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { getDb, HttpError } from '../db.ts';
import { isMasterAuthenticated, resolveFamilyByToken } from '../security.ts';
import { verifyAndApplyYooKassaPayment } from '../services/paymentService.ts';

export const webhookRouter = Router();

webhookRouter.post('/webhooks/yookassa', async (req, res, next) => {
  try {
    const externalId = String(req.body?.object?.id ?? '').trim();
    if (!externalId || !/^[A-Za-z0-9_-]{8,128}$/.test(externalId)) {
      throw new HttpError(400, 'Некорректный object.id в уведомлении ЮKassa');
    }

    const result = await verifyAndApplyYooKassaPayment(externalId);
    res.status(200).json({
      ok: true,
      status: result.status,
      already_processed: result.alreadyProcessed,
    });
  } catch (err) {
    next(err);
  }
});

webhookRouter.get('/files/receipts/:paymentId', (req, res, next) => {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId)) {
      throw new HttpError(400, 'Некорректный ID платежа');
    }

    const db = getDb();
    const payment = db
      .prepare('SELECT id, family_id, receipt_file_path, receipt_original_name FROM payments WHERE id = ?')
      .get(paymentId) as
      | {
          id: number;
          family_id: number;
          receipt_file_path: string | null;
          receipt_original_name: string | null;
        }
      | undefined;

    if (!payment || !payment.receipt_file_path) {
      throw new HttpError(404, 'Файл чека не найден');
    }

    const masterOk = isMasterAuthenticated(req);
    if (!masterOk) {
      const tokenHeader = req.headers['x-family-token']?.toString() ?? '';
      const tokenQuery = req.query.token?.toString() ?? '';
      const family = resolveFamilyByToken(tokenHeader || tokenQuery);
      if (family.id !== payment.family_id) {
        throw new HttpError(403, 'Доступ к файлу чека запрещён');
      }
    }

    const safeFileName = path.basename(payment.receipt_file_path);
    const fullPath = path.resolve(config.uploadsDir, safeFileName);
    if (!fs.existsSync(fullPath)) {
      throw new HttpError(404, 'Файл чека отсутствует на диске');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    const downloadName = payment.receipt_original_name || safeFileName;
    if (req.query.inline === '1') {
      res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`
      );
      res.sendFile(fullPath);
      return;
    }

    res.download(fullPath, downloadName);
  } catch (err) {
    next(err);
  }
});
