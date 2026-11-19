import type { PublicLesson } from '../types.ts';
import {
  formatSurgutTime,
  formatSurgutTimeRange,
  getSurgutDateParts,
  toSurgutDateKey,
} from './format.ts';

export interface ScheduleSlotGroup {
  key: string;
  dow: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  weekdayLabel: string;
  shortWeekday: string;
  startTime: string; // e.g. '10:00'
  timeRange: string; // e.g. '10:00–12:00'
  durationMinutes: number;
  singlePrice: number;
  dates: PublicLesson[];
  nearestOpen: PublicLesson | null;
  nearestLesson: PublicLesson;
}

const WEEKDAY_NAMES: Record<number, string> = {
  0: 'Воскресенье',
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
};

const WEEKDAY_SHORT: Record<number, string> = {
  0: 'Вс',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};

const CANONICAL_GROUP_ORDER = [
  '6-10:00',
  '6-13:00',
  '6-16:00',
  '0-10:00',
  '0-13:00',
  '0-16:00',
];

export function getSurgutWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export function formatShortDateRu(dateKeyOrIso: string): string {
  const dateKey =
    dateKeyOrIso.length === 10 && dateKeyOrIso.includes('-')
      ? dateKeyOrIso
      : toSurgutDateKey(dateKeyOrIso);
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKeyOrIso;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatLongDateRu(dateKeyOrIso: string): string {
  const dateKey =
    dateKeyOrIso.length === 10 && dateKeyOrIso.includes('-')
      ? dateKeyOrIso
      : toSurgutDateKey(dateKeyOrIso);
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKeyOrIso;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

export function groupWeekendSlots(lessons: PublicLesson[]): ScheduleSlotGroup[] {
  const groupLessons = lessons
    .filter((l) => l.lesson_type === 'group')
    .slice()
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const bucket = new Map<string, ScheduleSlotGroup>();

  for (const lesson of groupLessons) {
    const parts = getSurgutDateParts(lesson.start_time);
    if (!parts) continue;
    const dow = getSurgutWeekday(parts.dateKey);
    const startTime = formatSurgutTime(lesson.start_time);
    const key = `${dow}-${startTime}`;

    const existing = bucket.get(key);
    if (existing) {
      existing.dates.push(lesson);
      if (!existing.nearestOpen && lesson.free_spots > 0) {
        existing.nearestOpen = lesson;
      }
    } else {
      bucket.set(key, {
        key,
        dow,
        weekdayLabel: WEEKDAY_NAMES[dow] ?? 'Занятие',
        shortWeekday: WEEKDAY_SHORT[dow] ?? '',
        startTime,
        timeRange: formatSurgutTimeRange(lesson.start_time, lesson.duration_minutes),
        durationMinutes: lesson.duration_minutes,
        singlePrice: lesson.single_price,
        dates: [lesson],
        nearestOpen: lesson.free_spots > 0 ? lesson : null,
        nearestLesson: lesson,
      });
    }
  }

  return Array.from(bucket.values()).sort((a, b) => {
    const idxA = CANONICAL_GROUP_ORDER.indexOf(a.key);
    const idxB = CANONICAL_GROUP_ORDER.indexOf(b.key);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    // Otherwise order Sat (6) -> Sun (0) -> Mon (1)..Fri (5), then by startTime
    const orderDow = (d: number) => (d === 6 ? 0 : d === 0 ? 1 : d + 1);
    const dDiff = orderDow(a.dow) - orderDow(b.dow);
    if (dDiff !== 0) return dDiff;
    return a.startTime.localeCompare(b.startTime);
  });
}

export interface CalendarDayCell {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  dow: number; // 0 Sun .. 6 Sat
  lessons: PublicLesson[];
  isWeekend: boolean;
  isNoLessonsWeekend: boolean;
}

const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export function formatYearMonthRu(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  return `${MONTH_NAMES_RU[m - 1] ?? ''} ${y}`;
}

export function getAvailableCalendarMonths(lessons: PublicLesson[]): string[] {
  const months = new Set<string>();
  const todayYm = toSurgutDateKey(new Date()).slice(0, 7);
  if (lessons.length === 0 && todayYm) {
    months.add(todayYm);
  }
  for (const lesson of lessons) {
    const dk = toSurgutDateKey(lesson.start_time);
    if (dk) months.add(dk.slice(0, 7));
  }
  return Array.from(months).sort();
}

export function buildMonthCalendarCells(
  yearMonth: string,
  lessons: PublicLesson[]
): CalendarDayCell[] {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return [];

  const byDate = new Map<string, PublicLesson[]>();
  const allDateKeys: string[] = [];

  for (const lesson of lessons) {
    const dk = toSurgutDateKey(lesson.start_time);
    if (!dk) continue;
    allDateKeys.push(dk);
    const arr = byDate.get(dk);
    if (arr) {
      arr.push(lesson);
    } else {
      byDate.set(dk, [lesson]);
    }
  }

  for (const arr of byDate.values()) {
    arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }

  allDateKeys.sort();
  const minLessonKey = allDateKeys[0] ?? `${yearMonth}-01`;
  const maxLessonKey = allDateKeys[allDateKeys.length - 1] ?? `${yearMonth}-28`;

  const firstDayDow = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).getUTCDay();
  const leadingOffset = (firstDayDow + 6) % 7; // Monday = 0 .. Sunday = 6
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
  const totalCells = Math.ceil((leadingOffset + daysInMonth) / 7) * 7;

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayNum = i - leadingOffset + 1;
    const dt = new Date(Date.UTC(year, month - 1, dayNum, 12, 0, 0));
    const yStr = String(dt.getUTCFullYear());
    const mStr = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getUTCDate()).padStart(2, '0');
    const dateKey = `${yStr}-${mStr}-${dStr}`;
    const inMonth = dt.getUTCFullYear() === year && dt.getUTCMonth() + 1 === month;
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayLessons = byDate.get(dateKey) ?? [];

    const isExplicitCanceledNov29 = dateKey === '2026-11-29';
    const isBetweenLessons = dateKey >= minLessonKey && dateKey <= maxLessonKey;
    const isNoLessonsWeekend =
      inMonth &&
      isWeekend &&
      dayLessons.length === 0 &&
      (isExplicitCanceledNov29 || (allDateKeys.length > 0 && isBetweenLessons));

    cells.push({
      dateKey,
      dayNumber: dt.getUTCDate(),
      inMonth,
      dow,
      lessons: dayLessons,
      isWeekend,
      isNoLessonsWeekend,
    });
  }

  return cells;
}
