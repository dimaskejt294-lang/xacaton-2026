import type { BookingStatus, LessonType, PaymentMethod, PaymentStatus } from '../types.ts';

export function lessonTypeLabel(lessonType: LessonType | string): string {
  switch (lessonType) {
    case 'group':
      return 'Группа';
    case 'masterclass':
      return 'Мастер-класс';
    case 'individual':
      return 'Индивидуальное';
    case 'birthday':
      return 'День рождения';
    default:
      return 'Занятие';
  }
}

export function lessonTypeBadgeClasses(lessonType: LessonType | string): string {
  switch (lessonType) {
    case 'group':
      return 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]';
    case 'masterclass':
      return 'border-[#F6D5B8] bg-[#FDF4ED] text-[#C86D2D]';
    case 'individual':
      return 'border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]';
    case 'birthday':
      return 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]';
    default:
      return 'border-[#E5E7EB] bg-[#F3F4F6] text-[#374151]';
  }
}

export function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)} ₽`;
}

export const WORKSHOP_TIMEZONE = 'Asia/Yekaterinburg';

const surgutPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: WORKSHOP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getSurgutDateParts(input: Date | string): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  dateKey: string;
} | null {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return null;
  const parts = surgutPartsFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  const year = map.year ?? '1970';
  const month = map.month ?? '01';
  const day = map.day ?? '01';
  const hour = map.hour ?? '00';
  const minute = map.minute ?? '00';
  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${year}-${month}-${day}`,
  };
}

export function toSurgutDateKey(input: Date | string): string {
  return getSurgutDateParts(input)?.dateKey ?? '';
}

export function formatSurgutTime(iso: string): string {
  const parts = getSurgutDateParts(iso);
  if (!parts) return '—';
  return `${parts.hour}:${parts.minute}`;
}

export function formatSurgutTimeRange(startIso: string, durationMinutes: number): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return '—';
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const startParts = getSurgutDateParts(start);
  const endParts = getSurgutDateParts(end);
  if (!startParts || !endParts) return '—';
  return `${startParts.hour}:${startParts.minute}–${endParts.hour}:${endParts.minute}`;
}

export function isoToSurgutDatetimeLocal(iso: string): string {
  const parts = getSurgutDateParts(iso);
  if (!parts) return defaultNextWeekendDatetimeLocal();
  return `${parts.dateKey}T${parts.hour}:${parts.minute}`;
}

export function surgutDatetimeLocalToIso(localValue: string): string {
  const trimmed = localValue.trim();
  const normalized = trimmed.length === 16 ? `${trimmed}:00+05:00` : `${trimmed}+05:00`;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date(trimmed).toISOString();
}

export function defaultNextWeekendDatetimeLocal(): string {
  const todayKey = toSurgutDateKey(new Date());
  const [y, m, d] = todayKey.split('-').map(Number);
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + offset, 7, 0, 0));
    const dow = candidate.getUTCDay();
    if (dow === 6 || dow === 0) {
      return `${toSurgutDateKey(candidate)}T10:00`;
    }
  }
  return `${todayKey}T10:00`;
}

export function formatDateTimeRu(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('ru-RU', {
    timeZone: WORKSHOP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateRu(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('ru-RU', {
    timeZone: WORKSHOP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function pluralizeLessons(count: number): string {
  const abs = Math.abs(count) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return `${count} занятий`;
  if (n1 > 1 && n1 < 5) return `${count} занятия`;
  if (n1 === 1) return `${count} занятие`;
  return `${count} занятий`;
}

export function pluralizeYears(age: number): string {
  const abs = Math.abs(age) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return `${age} лет`;
  if (n1 > 1 && n1 < 5) return `${age} года`;
  if (n1 === 1) return `${age} год`;
  return `${age} лет`;
}

export function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case 'booked':
      return 'Записан';
    case 'attended':
      return 'Посетил';
    case 'missed':
      return 'Пропустил';
    case 'canceled':
      return 'Отмена';
  }
}

export function bookingStatusClasses(status: BookingStatus): string {
  switch (status) {
    case 'attended':
      return 'bg-[#ECFDF5] text-[#065F46]';
    case 'booked':
      return 'bg-[#FFFBEB] text-[#92400E]';
    case 'missed':
      return 'bg-[#FEF2F2] text-[#991B1B]';
    case 'canceled':
      return 'bg-slate-100 text-[#6B7280]';
  }
}

export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'yookassa':
      return 'ЮKassa (СБП / карта)';
    case 'cash':
      return 'Наличные';
    case 'transfer':
      return 'Перевод на карту';
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'succeeded':
      return 'Оплачено';
    case 'pending':
      return 'Ожидает оплаты';
    case 'canceled':
      return 'Отменено';
  }
}

export function paymentStatusClasses(status: PaymentStatus): string {
  switch (status) {
    case 'succeeded':
      return 'bg-[#ECFDF5] text-[#065F46]';
    case 'pending':
      return 'bg-[#FFFBEB] text-[#92400E]';
    case 'canceled':
      return 'bg-[#FEF2F2] text-[#991B1B]';
  }
}
