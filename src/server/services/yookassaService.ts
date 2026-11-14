import crypto from 'node:crypto';
import { config } from '../config.ts';
import { HttpError } from '../db.ts';

export interface YooKassaPaymentResponse {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  metadata?: Record<string, string>;
}

function getAuthHeader(): string {
  if (!config.yookassaShopId || !config.yookassaSecretKey) {
    throw new HttpError(
      500,
      'Платёжный шлюз ЮKassa не настроен: укажите YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в .env'
    );
  }
  const credentials = Buffer.from(`${config.yookassaShopId}:${config.yookassaSecretKey}`).toString('base64');
  return `Basic ${credentials}`;
}

export async function createYooKassaPayment(params: {
  amountRub: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  idempotenceKey?: string;
}): Promise<YooKassaPaymentResponse> {
  const authHeader = getAuthHeader();
  const idempotenceKey = params.idempotenceKey || crypto.randomUUID();
  const amountValue = params.amountRub.toFixed(2);

  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Idempotence-Key': idempotenceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: {
        value: amountValue,
        currency: 'RUB',
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: params.returnUrl,
      },
      description: params.description,
      metadata: params.metadata,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[YooKassa] Create payment failed:', response.status, errorBody);
    throw new HttpError(
      502,
      `Ошибка создания платежа в ЮKassa (HTTP ${response.status}). Проверьте настройки магазина.`
    );
  }

  return (await response.json()) as YooKassaPaymentResponse;
}

export async function fetchYooKassaPayment(externalPaymentId: string): Promise<YooKassaPaymentResponse> {
  const authHeader = getAuthHeader();

  const response = await fetch(
    `https://api.yookassa.ru/v3/payments/${encodeURIComponent(externalPaymentId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: authHeader,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[YooKassa] Fetch payment failed:', response.status, errorBody);
    throw new HttpError(502, `Не удалось проверить статус платежа в ЮKassa (HTTP ${response.status})`);
  }

  return (await response.json()) as YooKassaPaymentResponse;
}
