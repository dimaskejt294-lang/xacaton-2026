import crypto from 'node:crypto';
import { config } from './config.ts';
import { getDb, runInTransaction } from './db.ts';
import { generateAccessToken, hashPassword } from './security.ts';

function isoAtDaysFromNow(daysOffset: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
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
    const initialPassword =
      config.masterPassword || crypto.randomBytes(8).toString('base64url');
    if (!config.masterPassword) {
      console.log(`[Ясна] Сгенерирован временный пароль мастера: ${initialPassword}`);
    }
    const passwordHash = hashPassword(initialPassword);
    db.prepare(
      `INSERT INTO workshop_settings (id, free_cancel_hours, charge_on_miss, charge_on_late_cancel, master_password_hash)
       VALUES (1, 24, 1, 1, ?)`
    ).run(passwordHash);
  }

  const familyCount = db.prepare('SELECT COUNT(*) AS cnt FROM families').get() as { cnt: number };
  if (familyCount.cnt > 0) {
    seedInitialReviewsIfEmpty();
    const firstFamily =
      db
        .prepare('SELECT parent_name, access_token FROM families ORDER BY id ASC LIMIT 1')
        .get() as { parent_name: string; access_token: string } | undefined;
    if (firstFamily) {
      console.log(
        `[Ясна] Персональная ссылка семьи (${firstFamily.parent_name}): /lk/${firstFamily.access_token}`
      );
    }
    return;
  }

  const seededTokens = runInTransaction((tx) => {
    const nowIso = new Date().toISOString();

    // 1. Tariffs
    const singleTariffRes = tx
      .prepare(
        `INSERT INTO tariffs (title, lessons_count, price, validity_days, is_active)
         VALUES ('Разовое занятие', 1, 1200.00, 30, 1)`
      )
      .run();
    const singleTariffId = Number(singleTariffRes.lastInsertRowid);

    const sub4Res = tx
      .prepare(
        `INSERT INTO tariffs (title, lessons_count, price, validity_days, is_active)
         VALUES ('Абонемент на 4 занятия', 4, 4200.00, 45, 1)`
      )
      .run();
    const sub4TariffId = Number(sub4Res.lastInsertRowid);

    tx.prepare(
      `INSERT INTO tariffs (title, lessons_count, price, validity_days, is_active)
       VALUES ('Абонемент на 8 занятий', 8, 7800.00, 60, 1)`
    ).run();

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
         VALUES ('Марина Козлова', '+7 (922) 400-55-66', ?, -1200.00, ?)`
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
       VALUES (?, ?, NULL, 4200.00, 4, 'transfer', 'succeeded', 'https://lknpd.nalog.ru/api/v1/receipt/demo-yasna-4200', ?, ?)`
    ).run(fam2Id, sub4TariffId, nowIso, nowIso);

    tx.prepare(
      `INSERT INTO subscriptions (family_id, tariff_id, title, total_lessons, remaining_lessons, expires_at, created_at)
       VALUES (?, ?, 'Абонемент на 4 занятия', 4, 1, ?, ?)`
    ).run(fam3Id, sub4TariffId, expires45, nowIso);

    tx.prepare(
      `INSERT INTO payments (family_id, tariff_id, external_payment_id, amount, lessons_count, payment_method, status, created_at, paid_at)
       VALUES (?, ?, NULL, 1200.00, 1, 'cash', 'succeeded', ?, ?)`
    ).run(fam3Id, singleTariffId, nowIso, nowIso);

    // 5. Schedule Lessons
    // Mandatory Lesson 1: Tomorrow 15:00, Group, capacity=2, single_price=1200
    tx.prepare(
      `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description)
       VALUES ('Столярное дело: полка из массива', 'group', ?, 90, 2, 1200.00, 'Разметка, пиление сосны, шлифовка и сборка настенной полки своими руками.')`
    ).run(isoAtDaysFromNow(1, 15, 0));

    // Mandatory Lesson 2: Day after tomorrow 12:00, Individual, capacity=1, single_price=1800
    tx.prepare(
      `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description)
       VALUES ('Работа на токарном станке', 'individual', ?, 90, 1, 1800.00, 'Индивидуальное занятие с мастером Денисом Авимским: точение подсвечника или волчка.')`
    ).run(isoAtDaysFromNow(2, 12, 0));

    // Additional realistic schedule entries for rich view
    const lesson3Res = tx
      .prepare(
        `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description)
         VALUES ('Скворечник из кедра', 'group', ?, 90, 4, 1200.00, 'Групповая мастерская для детей 7–12 лет. Все материалы и защитные очки выдаются.')`
      )
      .run(isoAtDaysFromNow(3, 16, 30));
    const lesson3Id = Number(lesson3Res.lastInsertRowid);

    tx.prepare(
      `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description)
       VALUES ('Шкатулка с секретом', 'group', ?, 90, 4, 1200.00, 'Работа со столярным клеем, петлями и ручным фрезером под контролем мастера.')`
    ).run(isoAtDaysFromNow(4, 14, 0));

    // Past lesson for Максим (attended) so attendance history is populated
    const pastLessonRes = tx
      .prepare(
        `INSERT INTO lessons (title, lesson_type, start_time, duration_minutes, capacity, single_price, description)
         VALUES ('Подставка под телефон из дуба', 'group', ?, 90, 4, 1200.00, 'Первое знакомство с инструментами, распил и финишное покрытие маслом.')`
      )
      .run(isoAtDaysFromNow(-2, 15, 0));
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

    // Upcoming booking for Максим in lesson 3
    tx.prepare(
      `INSERT INTO bookings (lesson_id, child_id, status, is_charged, charged_subscription_id, charge_amount, is_makeup, created_at, updated_at)
       VALUES (?, ?, 'booked', 0, NULL, 0, 0, ?, ?)`
    ).run(lesson3Id, maximId, nowIso, nowIso);

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

  console.log('=================================================================');
  console.log('[Ясна] База данных инициализирована демо-данными:');
  console.log(`  Семья 1 (Елена Смирнова — Артём, Соня): /lk/${seededTokens.token1}`);
  console.log(`  Семья 2 (Алексей Иванов — Максим):       /lk/${seededTokens.token2}`);
  console.log(`  Семья 3 (Марина Козлова — Тимофей):      /lk/${seededTokens.token3}`);
  console.log('=================================================================');
}
