import crypto from 'node:crypto';
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

const YOOKASSA_API_BASE_URL = 'https://api.yookassa.ru/v3';
const YOOKASSA_REQUEST_TIMEOUT_MS = 10_000;
const ALLOWED_STATUSES = new Set(['pending', 'waiting_for_capture', 'succeeded', 'canceled']);

function isValidIdentifierString(value: unknown, minLen = 8, maxLen = 128): boolean {
  if (typeof value !== 'string') return false;
  const str = value.trim();
  if (str.length < minLen || str.length > maxLen) return false;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    const isAlphanumeric =
      (code >= 48 && code <= 57) || // 0-9
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122); // a-z
    const isSpecial = code === 45 || code === 95; // - or _
    if (!isAlphanumeric && !isSpecial) return false;
  }
  return true;
}

function getAuthHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();

  if (!shopId || !secretKey) {
    throw new HttpError(
      500,
      'Платёжный шлюз ЮKassa не настроен: укажите YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в переменных окружения'
    );
  }
  const credentials = Buffer.from(`${shopId}:${secretKey}`, 'utf8').toString('base64');
  return `Basic ${credentials}`;
}

function validateReturnUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl.length > 512) {
    throw new HttpError(400, 'Некорректная длина URL возврата');
  }
  try {
    const parsed = new URL(rawUrl.trim());
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

    if (!isHttps && !isLocalHttp) {
      throw new Error('Return URL must use secure HTTPS protocol');
    }
    if (parsed.username || parsed.password) {
      throw new Error('Credentials not allowed in returnUrl');
    }
    return parsed.toString();
  } catch {
    throw new HttpError(400, 'Некорректный URL возврата после оплаты');
  }
}

function sanitizeLogText(text: string, maxLength = 300): string {
  return text.replace(/[\r\n\t]/g, ' ').slice(0, maxLength);
}

function parseAndValidatePaymentResponse(payload: unknown): YooKassaPaymentResponse {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(502, 'Некорректный формат ответа от платёжного шлюза ЮKassa');
  }
  const obj = payload as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const status = typeof obj.status === 'string' ? obj.status.trim() : '';
  const amountObj =
    obj.amount && typeof obj.amount === 'object' ? (obj.amount as Record<string, unknown>) : null;
  const amountValue = amountObj && typeof amountObj.value === 'string' ? amountObj.value : '';
  const amountCurrency =
    amountObj && typeof amountObj.currency === 'string' ? amountObj.currency : '';

  if (
    !isValidIdentifierString(id, 8, 128) ||
    !ALLOWED_STATUSES.has(status) ||
    !amountValue ||
    !amountCurrency
  ) {
    throw new HttpError(502, 'Ответ ЮKassa не прошёл проверку целостности полей');
  }

  return obj as unknown as YooKassaPaymentResponse;
}

export async function createYooKassaPayment(params: {
  amountRub: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  idempotenceKey?: string;
}): Promise<YooKassaPaymentResponse> {
  const authHeader = getAuthHeader();

  if (!Number.isFinite(params.amountRub) || params.amountRub <= 0 || params.amountRub > 1_000_000) {
    throw new HttpError(400, 'Некорректная сумма платежа');
  }

  const safeReturnUrl = validateReturnUrl(params.returnUrl);
  const idempotenceKey =
    params.idempotenceKey && isValidIdentifierString(params.idempotenceKey, 8, 128)
      ? params.idempotenceKey
      : crypto.randomUUID();
  const amountValue = params.amountRub.toFixed(2);
  const safeDescription = params.description.trim().slice(0, 128);

  const response = await fetch(`${YOOKASSA_API_BASE_URL}/payments`, {
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
        return_url: safeReturnUrl,
      },
      description: safeDescription,
      metadata: params.metadata,
    }),
    signal: AbortSignal.timeout(YOOKASSA_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const safeError = sanitizeLogText(errorBody);
    console.error(`[YooKassa] Create payment failed (HTTP ${response.status}):`, safeError);
    throw new HttpError(
      502,
      `Ошибка создания платежа в ЮKassa (HTTP ${response.status}). Проверьте настройки магазина.`
    );
  }

  const rawJson = (await response.json()) as unknown;
  return parseAndValidatePaymentResponse(rawJson);
}

export async function fetchYooKassaPayment(
  externalPaymentId: string
): Promise<YooKassaPaymentResponse> {
  const authHeader = getAuthHeader();
  const cleanId = externalPaymentId.trim();

  if (!isValidIdentifierString(cleanId, 8, 128)) {
    throw new HttpError(400, 'Некорректный идентификатор платежа ЮKassa');
  }

  const response = await fetch(
    `${YOOKASSA_API_BASE_URL}/payments/${encodeURIComponent(cleanId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: authHeader,
      },
      signal: AbortSignal.timeout(YOOKASSA_REQUEST_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    const safeError = sanitizeLogText(errorBody);
    console.error(`[YooKassa] Fetch payment failed (HTTP ${response.status}):`, safeError);
    throw new HttpError(
      502,
      `Не удалось проверить статус платежа в ЮKassa (HTTP ${response.status})`
    );
  }

  const rawJson = (await response.json()) as unknown;
  return parseAndValidatePaymentResponse(rawJson);
}
