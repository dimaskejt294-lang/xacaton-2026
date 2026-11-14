import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import * as webpushNamespace from 'web-push';
import { config } from '../config.ts';
import { getDb, HttpError, runInTransaction } from '../db.ts';

const webpush = (
  'default' in webpushNamespace && webpushNamespace.default
    ? webpushNamespace.default
    : webpushNamespace
) as typeof webpushNamespace;

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface VapidKeysRecord {
  publicKey: string;
  privateKey: string;
}

let cachedVapid: VapidKeysRecord | null = null;
let reminderTimer: NodeJS.Timeout | null = null;

export function getVapidJsonPath(): string {
  if (process.env.VAPID_KEYS_FILE) {
    return path.resolve(process.env.VAPID_KEYS_FILE);
  }
  const dbDir = path.dirname(config.databasePath);
  if (path.basename(dbDir) === 'data' || dbDir.endsWith('/data')) {
    return path.join(dbDir, 'vapid.json');
  }
  return path.resolve(process.cwd(), 'data', 'vapid.json');
}

function loadVapidFromFile(filePath: string): VapidKeysRecord | null {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      const pub = typeof data.publicKey === 'string' ? data.publicKey.trim() : '';
      const priv = typeof data.privateKey === 'string' ? data.privateKey.trim() : '';
      if (pub && priv) {
        return { publicKey: pub, privateKey: priv };
      }
    }
  } catch (err) {
    console.warn('[Ясна Push] Не удалось прочитать vapid.json:', err);
  }
  return null;
}

function saveVapidToFile(filePath: string, keys: VapidKeysRecord): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.warn('[Ясна Push] Не удалось сохранить vapid.json на диск:', err);
  }
}

export function ensureVapidConfig(): VapidKeysRecord {
  if (cachedVapid) {
    return cachedVapid;
  }

  const vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:master@yasna-surgut.ru').trim();

  // 1. Environment variables have highest priority
  const envPub = (process.env.VAPID_PUBLIC_KEY ?? '').trim();
  const envPriv = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
  if (envPub && envPriv) {
    webpush.setVapidDetails(vapidSubject, envPub, envPriv);
    cachedVapid = { publicKey: envPub, privateKey: envPriv };
    return cachedVapid;
  }

  // 2. Persistent vapid.json file in data directory
  const vapidFile = getVapidJsonPath();
  const fileKeys = loadVapidFromFile(vapidFile);
  if (fileKeys) {
    webpush.setVapidDetails(vapidSubject, fileKeys.publicKey, fileKeys.privateKey);
    cachedVapid = fileKeys;
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO vapid_config (id, public_key, private_key)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, private_key = excluded.private_key`
      ).run(fileKeys.publicKey, fileKeys.privateKey);
    } catch (dbErr) {
      console.warn('[Ясна Push] Синхронизация vapid_config в БД пропущена:', dbErr);
    }
    return cachedVapid;
  }

  // 3. Database table
  const db = getDb();
  const dbRow = db
    .prepare('SELECT public_key, private_key FROM vapid_config WHERE id = 1')
    .get() as { public_key: string; private_key: string } | undefined;

  let publicKey = dbRow?.public_key;
  let privateKey = dbRow?.private_key;

  // 4. Auto-generate new VAPID keys if none found
  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;

    db.prepare(
      `INSERT INTO vapid_config (id, public_key, private_key)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, private_key = excluded.private_key`
    ).run(publicKey, privateKey);
  }

  // Persist keys to file so they survive restarts / image rebuilds
  saveVapidToFile(vapidFile, { publicKey, privateKey });

  webpush.setVapidDetails(vapidSubject, publicKey, privateKey);
  cachedVapid = { publicKey, privateKey };
  return cachedVapid;
}

export function getVapidPublicKey(): string {
  return ensureVapidConfig().publicKey;
}

export function getPushSubscriptionCount(familyId: number): number {
  const db = getDb();
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM push_subscriptions WHERE family_id = ?')
    .get(familyId) as { cnt: number };
  return row.cnt;
}

function isPrivateOrDisallowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    !host.includes('.') && net.isIP(host) === 0
  ) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    ) {
      return true;
    }
    return false;
  }

  if (ipVersion === 6) {
    if (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe8') ||
      host.startsWith('fe9') ||
      host.startsWith('fea') ||
      host.startsWith('feb') ||
      host.startsWith('::ffff:')
    ) {
      return true;
    }
  }

  // Reject integer/hex/octal obfuscated IPv4 literals (e.g. 2130706433, 0x7f000001)
  if (/^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(host)) {
    return true;
  }

  return false;
}

export function validatePushEndpoint(rawEndpoint: unknown): string {
  if (typeof rawEndpoint !== 'string' || !rawEndpoint.trim() || rawEndpoint.length > 1000) {
    throw new HttpError(400, 'Некорректный адрес push-подписки');
  }
  const trimmed = rawEndpoint.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(400, 'Некорректный URL push-подписки');
  }
  if (parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Push-подписка должна использовать HTTPS-адрес');
  }
  if (parsed.username || parsed.password) {
    throw new HttpError(400, 'URL push-подписки не должен содержать учётные данные');
  }
  if (isPrivateOrDisallowedHost(parsed.hostname)) {
    throw new HttpError(400, 'Указан недопустимый внутренний адрес push-подписки');
  }
  return trimmed;
}

export function savePushSubscription(
  familyId: number,
  input: PushSubscriptionInput
): { count: number } {
  const endpoint = validatePushEndpoint(input?.endpoint);
  const p256dh = typeof input?.keys?.p256dh === 'string' ? input.keys.p256dh.trim() : '';
  const auth = typeof input?.keys?.auth === 'string' ? input.keys.auth.trim() : '';

  if (!p256dh || p256dh.length > 512 || !auth || auth.length > 256) {
    throw new HttpError(400, 'Некорректные ключи шифрования push-подписки');
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO push_subscriptions (family_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       family_id = excluded.family_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       created_at = excluded.created_at`
  ).run(familyId, endpoint, p256dh, auth, now);

  return { count: getPushSubscriptionCount(familyId) };
}

export function removePushSubscription(familyId: number, endpoint: string): { count: number } {
  const trimmed = typeof endpoint === 'string' ? endpoint.trim() : '';
  const db = getDb();
  if (trimmed) {
    db.prepare('DELETE FROM push_subscriptions WHERE family_id = ? AND endpoint = ?').run(
      familyId,
      trimmed
    );
  }
  return { count: getPushSubscriptionCount(familyId) };
}

export async function sendPushToFamily(
  familyId: number,
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  const db = getDb();
  const subs = db
    .prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE family_id = ?')
    .all(familyId) as unknown as PushSubscriptionRow[];

  if (subs.length === 0) {
    return { sent: 0, removed: 0 };
  }

  const familyRow = db
    .prepare('SELECT access_token FROM families WHERE id = ?')
    .get(familyId) as { access_token: string } | undefined;

  const targetUrl =
    payload.url || (familyRow ? `/lk/${encodeURIComponent(familyRow.access_token)}` : '/');

  ensureVapidConfig();

  const bodyJson = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: targetUrl,
    tag: payload.tag || 'yasna-notification',
  });

  let sent = 0;
  let removed = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          bodyJson,
          { TTL: 24 * 3600 }
        );
        sent += 1;
      } catch (err) {
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: unknown }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
          removed += 1;
        } else {
          console.warn('[Ясна Push] Ошибка отправки на эндпоинт:', statusCode, err);
        }
      }
    })
  );

  return { sent, removed };
}

function formatLessonStartRu(isoDate: string): string {
  return new Date(isoDate).toLocaleString('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function processUpcomingLessonReminders(nowDate: Date = new Date()): number {
  const nowIso = nowDate.toISOString();
  const horizonIso = new Date(nowDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const candidates = runInTransaction((db) => {
    const rows = db
      .prepare(
        `SELECT b.id AS booking_id, c.family_id, c.name AS child_name,
                l.title AS lesson_title, l.start_time
         FROM bookings b
         JOIN children c ON c.id = b.child_id
         JOIN lessons l ON l.id = b.lesson_id
         WHERE b.status = 'booked'
           AND b.reminder_sent_at IS NULL
           AND l.is_canceled = 0
           AND l.start_time > ?
           AND l.start_time <= ?`
      )
      .all(nowIso, horizonIso) as Array<{
      booking_id: number;
      family_id: number;
      child_name: string;
      lesson_title: string;
      start_time: string;
    }>;

    const created: Array<{ familyId: number; title: string; message: string }> = [];
    for (const row of rows) {
      const upd = db
        .prepare(
          'UPDATE bookings SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL'
        )
        .run(nowIso, row.booking_id);
      if (upd.changes > 0) {
        const title = 'Напоминание о занятии';
        const message = `Напоминаем: ${row.child_name} записан(а) на «${row.lesson_title}» (${formatLessonStartRu(
          row.start_time
        )}). Ждём вас в мастерской «Ясна»!`;
        db.prepare(
          `INSERT INTO notifications (family_id, title, message, is_read, created_at)
           VALUES (?, ?, ?, 0, ?)`
        ).run(row.family_id, title, message, nowIso);
        created.push({ familyId: row.family_id, title, message });
      }
    }

    return created;
  });

  for (const item of candidates) {
    void sendPushToFamily(item.familyId, {
      title: item.title,
      body: item.message,
      tag: 'yasna-lesson-reminder',
    }).catch((pushErr) => {
      console.warn('[Ясна Push] Ошибка отправки напоминания о занятии:', pushErr);
    });
  }

  return candidates.length;
}

export function startReminderScheduler(): void {
  if (reminderTimer) {
    return;
  }
  try {
    ensureVapidConfig();
    processUpcomingLessonReminders();
  } catch (err) {
    console.error('[Ясна Push] Ошибка инициализации напоминаний:', err);
  }

  reminderTimer = setInterval(() => {
    try {
      processUpcomingLessonReminders();
    } catch (err) {
      console.error('[Ясна Push] Ошибка проверки напоминаний о занятиях:', err);
    }
  }, 5 * 60 * 1000);
  reminderTimer.unref();
}
