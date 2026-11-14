import type { BookingStatus, PaymentMethod, PaymentStatus } from '../types.ts';

export function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)} ₽`;
}

export function formatDateTimeRu(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateRu(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('ru-RU', {
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
