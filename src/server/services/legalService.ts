import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { config } from '../config.ts';
import { getDb, HttpError } from '../db.ts';

export type LegalDocKey = 'offer' | 'personal_data' | 'privacy';

export interface LegalDocumentRow {
  doc_key: LegalDocKey;
  title: string;
  file_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  content_text: string;
  updated_at: string;
}

export interface LegalDocumentPublic {
  doc_key: LegalDocKey;
  title: string;
  has_file: number;
  original_name: string | null;
  mime_type: string | null;
  content_text: string;
  updated_at: string;
}

const DEFAULT_LEGAL_DOCUMENTS: ReadonlyArray<{
  doc_key: LegalDocKey;
  title: string;
  content_text: string;
}> = [
  {
    doc_key: 'offer',
    title: 'Договор-оферта на оказание услуг',
    content_text:
      'ПУБЛИЧНАЯ ОФЕРТА\n' +
      'Детская столярная мастерская «Ясна» (г. Сургут, руководитель Денис Авимский).\n\n' +
      '1. Предмет оферты: мастерская обязуется провести групповые, индивидуальные занятия, мастер-классы или праздничные мероприятия по работе с деревом для детей, а Заказчик (родитель или законный представитель) — оплатить услуги согласно действующим тарифам.\n' +
      '2. Порядок записи и отмены: запись осуществляется через личный кабинет по персональной ссылке или через мастера. Бесплатная отмена возможна не позднее установленного мастерской срока до начала занятия; при пропуске или поздней отмене занятие списывается с активного абонемента.\n' +
      '3. Оплата и чеки: оплата производится онлайн через сервис ЮKassa (СБП / банковская карта) либо наличными / переводом у мастера с предоставлением чека самозанятого («Мой налог»).\n' +
      '4. Акцепт оферты: проставление отметки о согласии и оплата услуг означают полное принятие условий настоящего договора-оферты.',
  },
  {
    doc_key: 'personal_data',
    title: 'Согласие на обработку персональных данных',
    content_text:
      'СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ\n' +
      'В соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных»:\n\n' +
      'Я, являясь родителем (законным представителем) несовершеннолетнего ученика, даю согласие детской столярной мастерской «Ясна» (г. Сургут, руководитель Денис Авимский) на обработку персональных данных: ФИО родителя, контактный номер телефона, имя и возраст ребёнка, сведения о записях, посещаемости и оплатах.\n\n' +
      'Цель обработки: организация записи на занятия и мастер-классы, учёт абонементов и посещений, направление уведомлений в личный кабинет и оформление чеков.\n' +
      'Согласие действует до момента его отзыва путём обращения к руководителю мастерской.',
  },
  {
    doc_key: 'privacy',
    title: 'Политика конфиденциальности',
    content_text:
      'ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ\n' +
      'Детская столярная мастерская «Ясна» (г. Сургут).\n\n' +
      '1. Сбор данных: обрабатываются только минимально необходимые данные для организации обучения (имя родителя, телефон, имя и возраст ребёнка, история посещений и платежей).\n' +
      '2. Доступ и хранение: доступ в личный кабинет семьи защищён уникальным криптостойким токеном. Данные не передаются третьим лицам, за исключением платёжного шлюза ЮKassa при проведении онлайн-оплаты.\n' +
      '3. Платёжные реквизиты: данные банковских карт вводятся на защищённой странице ЮKassa и не сохраняются на сервере мастерской.\n' +
      '4. Права пользователя: родитель вправе запросить уточнение, выгрузку или удаление персональных данных, обратившись к мастеру.',
  },
];

export function getLegalUploadsDir(): string {
  const dir = path.join(config.uploadsDir, 'legal');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function parseLegalDocKey(raw: string): LegalDocKey {
  if (raw === 'offer' || raw === 'personal_data' || raw === 'privacy') {
    return raw;
  }
  throw new HttpError(400, 'Неизвестный тип документа');
}

export function ensureLegalDocumentsExist(db: DatabaseSync): void {
  const nowIso = new Date().toISOString();
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO legal_documents (doc_key, title, file_path, original_name, mime_type, content_text, updated_at)
     VALUES (?, ?, NULL, NULL, NULL, ?, ?)`
  );
  for (const item of DEFAULT_LEGAL_DOCUMENTS) {
    insertStmt.run(item.doc_key, item.title, item.content_text, nowIso);
  }
}

export function listLegalDocuments(): LegalDocumentPublic[] {
  const db = getDb();
  ensureLegalDocumentsExist(db);
  const rows = db
    .prepare(
      `SELECT doc_key, title, file_path, original_name, mime_type, content_text, updated_at
       FROM legal_documents
       ORDER BY CASE doc_key WHEN 'offer' THEN 1 WHEN 'personal_data' THEN 2 ELSE 3 END`
    )
    .all() as unknown as LegalDocumentRow[];

  return rows.map((row) => ({
    doc_key: row.doc_key,
    title: row.title,
    has_file: row.file_path ? 1 : 0,
    original_name: row.original_name,
    mime_type: row.mime_type,
    content_text: row.content_text,
    updated_at: row.updated_at,
  }));
}

export function getLegalDocumentRow(docKey: LegalDocKey): LegalDocumentRow {
  const db = getDb();
  ensureLegalDocumentsExist(db);
  const row = db
    .prepare(
      `SELECT doc_key, title, file_path, original_name, mime_type, content_text, updated_at
       FROM legal_documents
       WHERE doc_key = ?`
    )
    .get(docKey) as LegalDocumentRow | undefined;

  if (!row) {
    throw new HttpError(404, 'Документ не найден');
  }
  return row;
}

function removeExistingLegalFile(fileName: string | null): void {
  if (!fileName) return;
  const legalDir = path.resolve(getLegalUploadsDir());
  const safeName = path.basename(fileName);
  const fullPath = path.resolve(legalDir, safeName);
  if (fullPath.startsWith(`${legalDir}${path.sep}`) && fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

export function saveLegalDocumentFile(params: {
  docKey: LegalDocKey;
  storedFileName: string;
  originalName: string;
  mimeType: string;
}): void {
  const db = getDb();
  ensureLegalDocumentsExist(db);
  const existing = getLegalDocumentRow(params.docKey);
  if (existing.file_path && existing.file_path !== params.storedFileName) {
    removeExistingLegalFile(existing.file_path);
  }

  db.prepare(
    `UPDATE legal_documents
     SET file_path = ?, original_name = ?, mime_type = ?, updated_at = ?
     WHERE doc_key = ?`
  ).run(
    params.storedFileName,
    params.originalName.slice(0, 200),
    params.mimeType,
    new Date().toISOString(),
    params.docKey
  );
}

export function updateLegalDocumentText(params: {
  docKey: LegalDocKey;
  title?: string;
  contentText: string;
}): void {
  const db = getDb();
  ensureLegalDocumentsExist(db);
  const existing = getLegalDocumentRow(params.docKey);
  const cleanTitle = (params.title ?? existing.title).trim().slice(0, 160) || existing.title;
  const cleanText = params.contentText.trim();
  if (!cleanText || cleanText.length > 50000) {
    throw new HttpError(400, 'Текст документа должен содержать от 1 до 50 000 символов');
  }

  db.prepare(
    `UPDATE legal_documents
     SET title = ?, content_text = ?, updated_at = ?
     WHERE doc_key = ?`
  ).run(cleanTitle, cleanText, new Date().toISOString(), params.docKey);
}

export function deleteLegalDocumentFile(docKey: LegalDocKey): void {
  const db = getDb();
  ensureLegalDocumentsExist(db);
  const existing = getLegalDocumentRow(docKey);
  removeExistingLegalFile(existing.file_path);
  db.prepare(
    `UPDATE legal_documents
     SET file_path = NULL, original_name = NULL, mime_type = NULL, updated_at = ?
     WHERE doc_key = ?`
  ).run(new Date().toISOString(), docKey);
}
