import * as webpushNamespace from 'web-push';
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

let cachedVapid: { publicKey: string; privateKey: string } | null = null;
let reminderTimer: NodeJS.Timeout | null = null;

function ensureVapidConfig(): { publicKey: string; privateKey: string } {
  if (cachedVapid) {
    return cachedVapid;
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT public_key, private_key FROM vapid_config WHERE id = 1')
    .get() as { public_key: string; private_key: string } | undefined;

  let publicKey = existing?.public_key;
  let privateKey = existing?.private_key;

  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    db.prepare(
      `INSERT OR IGNORE INTO vapid_config (id, public_key, private_key)
       VALUES (1, ?, ?)`
    ).run(publicKey, privateKey);

    const stored = db
      .prepare('SELECT public_key, private_key FROM vapid_config WHERE id = 1')
      .get() as { public_key: string; private_key: string } | undefined;
    if (stored) {
      publicKey = stored.public_key;
      privateKey = stored.private_key;
    }
  }

  webpush.setVapidDetails('mailto:master@yasna-surgut.ru', publicKey, privateKey);
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
  const isLocalDev =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !isLocalDev) {
    throw new HttpError(400, 'Push-подписка должна использовать HTTPS-адрес');
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
        }
      }
    })
  );

  return { sent, removed };
}

function formatLessonStartRu(isoDate: string): string {
  return new Date(isoDate).toLocaleString('ru-RU', {
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
    }).catch(() => {});
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
