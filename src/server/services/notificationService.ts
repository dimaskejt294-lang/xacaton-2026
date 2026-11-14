import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db.ts';

export function createNotification(
  familyId: number,
  title: string,
  message: string,
  dbOverride?: DatabaseSync
): number {
  const db = dbOverride ?? getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO notifications (family_id, title, message, is_read, created_at)
       VALUES (?, ?, ?, 0, ?)`
    )
    .run(familyId, title, message, now);
  return Number(result.lastInsertRowid);
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
