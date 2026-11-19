import { config } from './config.ts';
import { getDb, runInTransaction } from './db.ts';
import { generateAccessToken, hashPassword } from './security.ts';

function surgutIso(
  year: number,
  monthIndex0: number,
  day: number,
  hour: number,
  minute: number
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = String(year).padStart(4, '0');
  const m = pad(monthIndex0 + 1);
  const d = pad(day);
  const h = pad(hour);
  const min = pad(minute);
  return new Date(`${y}-${m}-${d}T${h}:${min}:00+05:00`).toISOString();
}

function getSurgutCalendarDate(offsetDays = 0): {
  year: number;
  month0: number;
  day: number;
  dow: number;
} {
  const shifted = new Date(Date.now() + 5 * 3600 * 1000);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dow: shifted.getUTCDay(),
  };
}

const GROUP_LESSON_TITLE = 'Групповое занятие';
const GROUP_LESSON_DESCRIPTION =
  'Групповое занятие (2 часа). Ребята и взрослые от 6 лет работают над своими проектами из дерева под руководством мастера. Все материалы и инструменты включены.';

export function buildUpcomingWeekendGroupSlots(weeksAhead = 3): Array<{
  title: string;
  description: string;
  startIso: string;
}> {
  const minStartMs = Date.now() + 15 * 60 * 1000;
  const maxDays = weeksAhead * 7 + 14;
  const slots: Array<{ title: string; description: string; startIso: string }> = [];
  let weekendDaysCollected = 0;

  for (let offset = 0; offset < maxDays && weekendDaysCollected < weeksAhead * 2; offset += 1) {
    const cal = getSurgutCalendarDate(offset);
    if (cal.dow !== 6 && cal.dow !== 0) {
      continue;
    }
    // 29 ноября 2026 года занятий нет
    if (cal.year === 2026 && cal.month0 === 10 && cal.day === 29) {
      continue;
    }

    let addedOnDay = 0;
    for (const hour of [10, 13, 16]) {
      const startIso = surgutIso(cal.year, cal.month0, cal.day, hour, 0);
      if (new Date(startIso).getTime() <= minStartMs) {
        continue;
      }
      slots.push({
        title: GROUP_LESSON_TITLE,
        description: GROUP_LESSON_DESCRIPTION,
        startIso,
      });
      addedOnDay += 1;
    }

    if (addedOnDay > 0) {
      weekendDaysCollected += 1;
    }
  }

  return slots;
}

function getLastPastWeekendDateIso(): string {
  for (let offset = -1; offset >= -7; offset -= 1) {
    const cal = getSurgutCalendarDate(offset);
    if (cal.dow === 6 || cal.dow === 0) {
      return surgutIso(cal.year, cal.month0, cal.day, 10, 0);
    }
  }
  const fallback = getSurgutCalendarDate(-7);
  return surgutIso(fallback.year, fallback.month0, fallback.day, 10, 0);
}

function seedInitialReviewsIfEmpty(): void {
  const db = getDb();
  const reviewCount = db.prepare('SELECT COUNT(*) AS cnt FROM reviews').get() as { cnt: number };
  if (reviewCount.cnt > 0) {
    return;
  }

  const families = db
    .prepare('SELECT id, parent_name FROM families ORDER BY id ASC')
    .all() as Array<{ id: number; parent_name: string }>;

  const now = Date.now();
  const initialReviews = [
    {
      family_id: families[0]?.id ?? null,
      author_name: 'Елена Смирнова',
      child_info: 'Артём (8 лет) и Соня (10 лет)',
      rating: 5,
      text: 'Дети с нетерпением ждут субботы! За два месяца принесли домой полку из сосны и шкатулку с выжиганием. Очень удобно, что можно записать обоих детей в одном кабинете и сразу видеть остаток занятий.',
      created_at: new Date(now - 5 * 24 * 3600 * 1000).toISOString(),
    },
    {
      family_id: families[1]?.id ?? null,
      author_name: 'Алексей Иванов',
      child_info: 'Максим (9 лет)',
      rating: 5,
      text: 'Денис Авимский отлично объясняет технику безопасности — сын впервые работал на токарном станке под присмотром мастера и теперь гордится своим подсвечником. Чек и списания по абонементу всегда под рукой.',
      created_at: new Date(now - 3 * 24 * 3600 * 1000).toISOString(),
    },
    {
      family_id: families[2]?.id ?? null,
      author_name: 'Марина Козлова',
      child_info: 'Тимофей (11 лет)',
      rating: 5,
      text: 'Раньше приходилось переписываться в мессенджере, чтобы узнать, осталось ли занятие на абонементе. Сейчас по персональной ссылке сразу видно и расписание со свободными местами, и историю посещений.',
      created_at: new Date(now - 1 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const stmt = db.prepare(
    `INSERT INTO reviews (family_id, author_name, child_info, rating, text, is_published, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  );
  for (const r of initialReviews) {
    stmt.run(r.family_id, r.author_name, r.child_info, r.rating, r.text, r.created_at);
  }
}

export function seedInitialDataIfEmpty(): void {
  const db = getDb();

  // Ensure workshop settings singleton exists
  const settings = db.prepare('SELECT id FROM workshop_settings WHERE id = 1').get();
  if (!settings) {
    const initialPassword = config.masterPassword || '12345678';
    const passwordHash = hashPassword(initialPassword);
    db.prepare(
      `INSERT INTO workshop_settings (
         id, free_cancel_hours, charge_on_miss, charge_on_late_cancel, master_password_hash,
         show_hero_age, hero_age_text, show_hero_duration, hero_duration_text,
         show_hero_groups, hero_groups_text, show_hero_free_cancel, default_group_capacity
       )
       VALUES (1, 24, 1, 1, ?, 1, 'От 6 лет', 1, '2 часа', 1, 'до 4 мест', 0, 4)`
    ).run(passwordHash);
  }

  const familyCount = db.prepare('SELECT COUNT(*) AS cnt FROM families').get() as { cnt: number };
  if (familyCount.cnt > 0) {
    seedInitialReviewsIfEmpty();
    const firstFamily =
      db
        .prepare('SELECT parent_name, access_token FROM families ORDER BY id ASC LIMIT 1')
        .get() as { parent_name: string; access_token: string } | undefined;
    if (firstFamily && !config.isProduction) {
      console.log(
        `[Ясна] Персональная ссылка семьи (${firstFamily.parent_name}): /lk/${firstFamily.access_token}`
      );
    }
    return;
  }

  const seededTokens = runInTransaction((tx) => {
    const nowIso = new Date().toISOString();

    // 1. Tariffs
    tx.prepare(
      `INSERT INTO tariffs (title, lessons_count, price, validity_days, is_active)
       VALUES ('Пробное занятие', 1, 1000.00, 30, 1)`
    ).run();

    const singleTariffRes = tx
      .prepare(
        `INSERT INTO tariffs (title, lessons_count, price, validity_days, is_active)
         VALUES ('Разовое занятие', 1, 1600.00, 30, 1)`
      )
      .run();
    const singleTariffId = Number(singleTariffRes.lastInsertRowid);

    const sub4Res = tx
      .prepare(
        `INSERT INTO tariffs (title, lessons_count, price, validity_days, is_active)
         VALUES ('Абонемент на 4 занятия', 4, 5500.00, 45, 1)`
      )
      .run();
    const sub4TariffId = Number(sub4Res.lastInsertRowid);

    // 2. Family 1: Елена Смирнова (2 children: Артём 8 лет, Соня 10 лет)
    const token1 = generateAccessToken();
    const fam1Res = tx
      .prepare(
        `INSERT INTO families (parent_name, phone, access_token, money_balance, created_at)
         VALUES ('Елена Смирнова', '+7 (922) 400-11-22', ?, 0.00, ?)`
      )
      .run(token1, nowIso);
    const fam1Id = Number(fam1Res.lastInsertRowid);

    tx.prepare(
      `INSERT INTO children (family_id, name, age, notes)
       VALUES (?, 'Артём', 8, 'Любит работать лобзиком и рубанком')`
    ).run(fam1Id);
    tx.prepare(
      `INSERT INTO children (family_id, name, age, notes)
       VALUES (?, 'Соня', 10, 'Предпочитает шкатулки и выжигание по дереву')`
    ).run(fam1Id);

    // 3. Family 2: Алексей Иванов (1 child: Максим 9 лет)
    const token2 = generateAccessToken();
    const fam2Res = tx
      .prepare(
        `INSERT INTO families (parent_name, phone, access_token, money_balance, created_at)
         VALUES ('Алексей Иванов', '+7 (922) 400-33-44', ?, 0.00, ?)`
      )
      .run(token2, nowIso);
    const fam2Id = Number(fam2Res.lastInsertRowid);

    const maximRes = tx
      .prepare(
        `INSERT INTO children (family_id, name, age, notes)
         VALUES (?, 'Максим', 9, 'Осваивает токарный станок по дереву')`
      )
      .run(fam2Id);
    const maximId = Number(maximRes.lastInsertRowid);

    // 4. Family 3: Марина Козлова (1 child: Тимофей 11 лет, 1 lesson left -> renewal reminder!)
    const token3 = generateAccessToken();
    const fam3Res = tx
      .prepare(
        `INSERT INTO families (parent_name, phone, access_token, money_balance, created_at)
         VALUES ('Марина Козлова', '+7 (922) 400-55-66', ?, -1600.00, ?)`
      )
      .run(token3, nowIso);
    const fam3Id = Number(fam3Res.lastInsertRowid);

    tx.prepare(
      `INSERT INTO children (family_id, name, age, notes)
       VALUES (?, 'Тимофей', 11, 'Собрал кормушку и скворечник')`
    ).run(fam3Id);

    // Active subscriptions & payments for Families 2 & 3
    const expires45 = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    tx.prepare(
      `INSERT INTO subscriptions (family_id, tariff_id, title, total_lessons, remaining_lessons, expires_at, created_at)
       VALUES (?, ?, 'Абонемент на 4 занятия', 4, 3, ?, ?)`
    ).run(fam2Id, sub4TariffId, expires45, nowIso);

    tx.prepare(
      `INSERT INTO payments (family_id, tariff_id, external_payment_id, amount, lessons_count, payment_method, status, receipt_url, created_at, paid_at)
       VALUES (?, ?, NULL, 5500.00, 4, 'transfer', 'succeeded', 'https://lknpd.nalog.ru/api/v1/receipt/demo-yasna-5500', ?, ?)`
    ).run(fam2Id, sub4TariffId, nowIso, nowIso);

    tx.prepare(
      `INSERT INTO subscriptions (family_id, tariff_id, title, total_lessons, remaining_lessons, expires_at, created_at)
       VALUES (?, ?, 'Абонемент на 4 занятия', 4, 1, ?, ?)`
    ).run(fam3Id, sub4TariffId, expires45, nowIso);

    tx.prepare(
      `INSERT INTO payments (family_id, tariff_id, external_payment_id, amount, lessons_count, payment_method, status, created_at, paid_at)
       VALUES (?, ?, NULL, 1600.00, 1, 'cash', 'succeeded', ?, ?)`
    ).run(fam3Id, singleTariffId, nowIso, nowIso);

    // 5. Real Weekend Group Schedule: Saturday & Sunday at 10:00, 13:00, 16:00 (Surgut UTC+5), 2 hours (120 min)
    const weekendSlots = buildUpcomingWeekendGroupSlots(3);
    const insertLessonStmt = tx.prepare(
      `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description)
       VALUES (?, 'group', ?, 120, 4, 1600.00, ?)`
    );
    let firstUpcomingLessonId: number | null = null;
    for (const slot of weekendSlots) {
      const res = insertLessonStmt.run(slot.title, slot.startIso, slot.description);
      if (firstUpcomingLessonId === null) {
        firstUpcomingLessonId = Number(res.lastInsertRowid);
      }
    }

    // Past weekend lesson for Максим (attended, 2 hours) so attendance history is populated
    const pastLessonRes = tx
      .prepare(
        `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description)
         VALUES ('Групповое занятие', 'group', ?, 120, 4, 1600.00, 'Первое знакомство с инструментами, работа над своим проектом из дерева.')`
      )
      .run(getLastPastWeekendDateIso());
    const pastLessonId = Number(pastLessonRes.lastInsertRowid);

    const pastBookingRes = tx
      .prepare(
        `INSERT INTO bookings (lesson_id, child_id, status, is_charged, charged_subscription_id, charge_amount, is_makeup, created_at, updated_at)
         VALUES (?, ?, 'attended', 1, 1, 0, 0, ?, ?)`
      )
      .run(pastLessonId, maximId, nowIso, nowIso);
    tx.prepare(
      `INSERT INTO attendance_logs (booking_id, old_status, new_status, reason, changed_at)
       VALUES (?, 'booked', 'attended', 'Отмечено мастером на занятии', ?)`
    ).run(Number(pastBookingRes.lastInsertRowid), nowIso);

    // Upcoming booking for Максим in the nearest upcoming weekend slot
    if (firstUpcomingLessonId !== null) {
      tx.prepare(
        `INSERT INTO bookings (lesson_id, child_id, status, is_charged, charged_subscription_id, charge_amount, is_makeup, created_at, updated_at)
         VALUES (?, ?, 'booked', 0, NULL, 0, 0, ?, ?)`
      ).run(firstUpcomingLessonId, maximId, nowIso, nowIso);
    }

    // Welcome notification for Family 1
    tx.prepare(
      `INSERT INTO notifications (family_id, title, message, is_read, created_at)
       VALUES (?, 'Добро пожаловать в мастерскую «Ясна»', 'Используйте эту персональную ссылку для записи Артёма и Сони, оплаты абонементов и скачивания чеков.', 0, ?)`
    ).run(fam1Id, nowIso);

    tx.prepare(
      `INSERT INTO notifications (family_id, title, message, is_read, created_at)
       VALUES (?, 'Заканчивается абонемент', 'На абонементе осталось 1 занятие. Продлите абонемент в разделе «Оплаты и чеки».', 0, ?)`
    ).run(fam3Id, nowIso);

    return { token1, token2, token3 };
  });

  seedInitialReviewsIfEmpty();

  if (!config.isProduction) {
    console.log('=================================================================');
    console.log('[Ясна] База данных инициализирована стартовыми данными:');
    console.log(`  Семья 1 (Елена Смирнова — Артём, Соня): /lk/${seededTokens.token1}`);
    console.log(`  Семья 2 (Алексей Иванов — Максим):       /lk/${seededTokens.token2}`);
    console.log(`  Семья 3 (Марина Козлова — Тимофей):      /lk/${seededTokens.token3}`);
    console.log('=================================================================');
  }
}
