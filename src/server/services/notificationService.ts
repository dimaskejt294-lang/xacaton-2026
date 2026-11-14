import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db.ts';
import { sendPushToFamily } from './pushService.ts';

export function createNotification(
  familyId: number,
  title: string,
  message: string,
  dbOverride?: DatabaseSync,
  options?: { skipPush?: boolean }
): number {
  const db = dbOverride ?? getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO notifications (family_id, title, message, is_read, created_at)
       VALUES (?, ?, ?, 0, ?)`
    )
    .run(familyId, title, message, now);
  const notificationId = Number(result.lastInsertRowid);

  // Only schedule async Web Push if the family actually has at least one registered device
  if (!options?.skipPush) {
    const hasPush = db
      .prepare('SELECT 1 FROM push_subscriptions WHERE family_id = ? LIMIT 1')
      .get(familyId);
    if (hasPush) {
      setImmediate(() => {
        void sendPushToFamily(familyId, {
          title,
          body: message,
          tag: `yasna-notif-${notificationId}`,
        }).catch((err) => {
          console.warn('[NotificationService] Ошибка отправки push-уведомления:', err);
        });
      });
    }
  }

  return notificationId;
}

export function markNotificationRead(notificationId: number, familyId: number): void {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND family_id = ?').run(
    notificationId,
    familyId
  );
}

export function markAllNotificationsRead(familyId: number): void {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE family_id = ? AND is_read = 0').run(
    familyId
  );
}
