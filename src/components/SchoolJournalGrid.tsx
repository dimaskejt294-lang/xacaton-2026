import { CalendarPlus, Check, Grid3x3, Search, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { BookingStatus, MasterFamily, MasterLesson, MasterLessonBooking } from '../types.ts';
import { formatDateTimeRu, getSurgutDateParts, pluralizeYears } from '../utils/format.ts';

interface SchoolJournalGridProps {
  lessons: MasterLesson[];
  families: MasterFamily[];
  onMarkStatus: (bookingId: number, status: BookingStatus, reason?: string) => Promise<void>;
  onEnrollChild: (lessonId: number, childId: number) => Promise<void>;
}

interface StudentRow {
  childId: number;
  childName: string;
  childAge: number;
  familyId: number;
  parentName: string;
  remainingLessons: number;
  needsRenewal: boolean;
}

interface SelectedCell {
  childId: number;
  lessonId: number;
}

function shortDateParts(iso: string): { dayMonth: string; time: string } {
  const parts = getSurgutDateParts(iso);
  if (!parts) {
    return { dayMonth: '—', time: '' };
  }
  return {
    dayMonth: `${parts.day}.${parts.month}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function cellSymbol(status: BookingStatus): string {
  switch (status) {
    case 'attended':
      return 'П';
    case 'missed':
      return 'Н';
    case 'booked':
      return 'З';
    case 'canceled':
      return 'О';
  }
}

function cellStyleClasses(status: BookingStatus): string {
  switch (status) {
    case 'attended':
      return 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46] hover:bg-[#D1FAE5]';
    case 'missed':
      return 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2]';
    case 'booked':
      return 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7]';
    case 'canceled':
      return 'border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]';
  }
}

export const SchoolJournalGrid: React.FC<SchoolJournalGridProps> = ({
  lessons,
  families,
  onMarkStatus,
  onEnrollChild,
}) => {
  const [search, setSearch] = useState('');
  const [showCanceledLessons, setShowCanceledLessons] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [cellReason, setCellReason] = useState('');
  const [busyCell, setBusyCell] = useState(false);

  const sortedLessons = useMemo(() => {
    return lessons
      .filter((l) => showCanceledLessons || l.is_canceled === 0)
      .slice()
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [lessons, showCanceledLessons]);

  const students = useMemo<StudentRow[]>(() => {
    const query = search.trim().toLowerCase();
    const list: StudentRow[] = [];
    for (const fam of families) {
      for (const child of fam.children) {
        if (
          query &&
          !child.name.toLowerCase().includes(query) &&
          !fam.parent_name.toLowerCase().includes(query)
        ) {
          continue;
        }
        list.push({
          childId: child.id,
          childName: child.name,
          childAge: child.age,
          familyId: fam.id,
          parentName: fam.parent_name,
          remainingLessons: fam.remaining_lessons,
          needsRenewal: fam.needs_renewal,
        });
      }
    }
    return list.sort((a, b) => a.childName.localeCompare(b.childName, 'ru'));
  }, [families, search]);

  // Build fast lookup map: `${childId}:${lessonId}` -> booking (prefer active booking over canceled)
  const bookingCellMap = useMemo(() => {
    const map = new Map<string, MasterLessonBooking>();
    for (const lesson of lessons) {
      for (const b of lesson.bookings) {
        const key = `${b.child_id}:${lesson.id}`;
        const existing = map.get(key);
        if (!existing || (existing.status === 'canceled' && b.status !== 'canceled')) {
          map.set(key, b);
        }
      }
    }
    return map;
  }, [lessons]);

  const activeSelection = useMemo(() => {
    if (!selectedCell) return null;
    const student = students.find((s) => s.childId === selectedCell.childId);
    const lesson = sortedLessons.find((l) => l.id === selectedCell.lessonId);
    if (!student || !lesson) return null;
    const booking = bookingCellMap.get(`${student.childId}:${lesson.id}`) ?? null;
    return { student, lesson, booking };
  }, [selectedCell, students, sortedLessons, bookingCellMap]);

  const handleActionStatus = async (bookingId: number, status: BookingStatus) => {
    setBusyCell(true);
    try {
      await onMarkStatus(bookingId, status, cellReason);
      setCellReason('');
      setSelectedCell(null);
    } finally {
      setBusyCell(false);
    }
  };

  const handleActionEnroll = async (lessonId: number, childId: number) => {
    setBusyCell(true);
    try {
      await onEnrollChild(lessonId, childId);
      setSelectedCell(null);
    } finally {
      setBusyCell(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Grid3x3 className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
              <h2 className="font-display text-lg font-semibold text-[#111827]">
                Школьный журнал (табель посещаемости)
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              Строки — ученики, столбцы — занятия по датам. Нажмите на любую клеточку для отметки
              посещения или записи.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск ученика или родителя..."
                className="min-h-[40px] w-60 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] pr-3 pl-9 text-xs text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
              />
            </div>

            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827]">
              <input
                type="checkbox"
                checked={showCanceledLessons}
                onChange={(e) => setShowCanceledLessons(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#C86D2D]"
              />
              Отменённые занятия
            </label>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#F3F4F6] pt-3 text-xs text-[#4B5563]">
          <span className="font-medium text-[#6B7280]">Обозначения:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#A7F3D0] bg-[#ECFDF5] font-bold text-[#065F46]">
              П
            </span>
            Посетил
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#FECACA] bg-[#FEF2F2] font-bold text-[#991B1B]">
              Н
            </span>
            Пропустил
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#FDE68A] bg-[#FFFBEB] font-bold text-[#92400E]">
              З
            </span>
            Записан
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F3F4F6] font-bold text-[#6B7280]">
              О
            </span>
            Отмена
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-[#D1D5DB] bg-[#FAFAFA] text-[#9CA3AF]">
              ·
            </span>
            Не записан
          </span>
        </div>
      </div>

      {/* Selected Cell Editor Popover Bar */}
      {activeSelection && (
        <div className="rounded-2xl border border-[#F3D5BD] bg-[#FDF8F3] p-4 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="text-xs font-medium text-[#C86D2D]">Выбрана клеточка журнала</div>
              <div className="mt-0.5 text-sm font-semibold text-[#111827]">
                {activeSelection.student.childName} ({activeSelection.student.parentName}) ·{' '}
                {activeSelection.lesson.title} ({formatDateTimeRu(activeSelection.lesson.start_time)})
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedCell(null)}
              aria-label="Закрыть панель клеточки"
              className="inline-flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center self-start rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827] sm:self-center"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          {activeSelection.booking ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={cellReason}
                onChange={(e) => setCellReason(e.target.value)}
                placeholder="Комментарий к отметке (опционально)"
                className="min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs focus:border-[#C86D2D] focus:outline-none sm:w-64"
              />
              <button
                type="button"
                disabled={busyCell}
                onClick={() => void handleActionStatus(activeSelection.booking!.id, 'attended')}
                className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-xl px-3.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  activeSelection.booking.status === 'attended'
                    ? 'bg-[#065F46] text-white'
                    : 'border border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46] hover:bg-[#D1FAE5]'
                }`}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                П — Посетил
              </button>
              <button
                type="button"
                disabled={busyCell}
                onClick={() => void handleActionStatus(activeSelection.booking!.id, 'missed')}
                className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-xl px-3.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  activeSelection.booking.status === 'missed'
                    ? 'bg-[#991B1B] text-white'
                    : 'border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2]'
                }`}
              >
                Н — Пропустил
              </button>
              <button
                type="button"
                disabled={busyCell}
                onClick={() => void handleActionStatus(activeSelection.booking!.id, 'booked')}
                className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-xl px-3.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  activeSelection.booking.status === 'booked'
                    ? 'bg-[#C86D2D] text-white'
                    : 'border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7]'
                }`}
              >
                З — Записан
              </button>
              <button
                type="button"
                disabled={busyCell}
                onClick={() => void handleActionStatus(activeSelection.booking!.id, 'canceled')}
                className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-xl px-3.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  activeSelection.booking.status === 'canceled'
                    ? 'bg-[#4B5563] text-white'
                    : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F3F4F6]'
                }`}
              >
                О — Отмена
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {activeSelection.lesson.is_canceled === 1 ? (
                <span className="text-xs font-medium text-[#991B1B]">
                  Занятие отменено — запись невозможна.
                </span>
              ) : new Date(activeSelection.lesson.start_time).getTime() <= Date.now() ? (
                <span className="text-xs font-medium text-[#6B7280]">
                  Занятие уже прошло — запись через журнал недоступна.
                </span>
              ) : activeSelection.lesson.free_spots === 0 ? (
                <span className="text-xs font-medium text-[#92400E]">
                  Свободных мест на занятии нет ({activeSelection.lesson.booked_count} из{' '}
                  {activeSelection.lesson.capacity}).
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busyCell}
                  onClick={() =>
                    void handleActionEnroll(activeSelection.lesson.id, activeSelection.student.childId)
                  }
                  className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-4 text-xs font-medium text-white shadow-sm hover:bg-[#B05B20] disabled:opacity-60"
                >
                  <CalendarPlus className="h-4 w-4" strokeWidth={1.5} />
                  Записать ученика на занятие (свободно {activeSelection.lesson.free_spots})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grid Register Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {students.length === 0 || sortedLessons.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B7280]">
            {students.length === 0
              ? 'Ученики по вашему запросу не найдены.'
              : 'Занятий для отображения в таблице пока нет.'}
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <th className="sticky left-0 z-10 min-w-[200px] border-r border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#111827]">
                  № / Ученик
                </th>
                {sortedLessons.map((lesson) => {
                  const { dayMonth, time } = shortDateParts(lesson.start_time);
                  return (
                    <th
                      key={lesson.id}
                      title={`${lesson.title} · ${formatDateTimeRu(lesson.start_time)}`}
                      className={`min-w-[76px] border-r border-[#E5E7EB] px-1.5 py-2.5 text-center align-top ${
                        lesson.is_canceled ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="text-xs font-bold text-[#111827] tabular-nums">{dayMonth}</div>
                      <div className="text-[11px] font-medium text-[#6B7280] tabular-nums">
                        {time}
                      </div>
                      <div className="mx-auto mt-1 max-w-[68px] truncate text-[10px] font-normal text-[#6B7280]">
                        {lesson.title}
                      </div>
                    </th>
                  );
                })}
                <th
                  title="Всего посещено"
                  className="min-w-[44px] border-l border-[#E5E7EB] px-2 py-3 text-center text-xs font-bold text-[#065F46]"
                >
                  П
                </th>
                <th
                  title="Всего пропущено"
                  className="min-w-[44px] border-l border-[#E5E7EB] px-2 py-3 text-center text-xs font-bold text-[#991B1B]"
                >
                  Н
                </th>
                <th
                  title="Остаток занятий на абонементе семьи"
                  className="min-w-[54px] border-l border-[#E5E7EB] px-2 py-3 text-center text-xs font-bold text-[#111827]"
                >
                  Ост.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {students.map((student, index) => {
                let attendedCount = 0;
                let missedCount = 0;
                for (const lesson of sortedLessons) {
                  const booking = bookingCellMap.get(`${student.childId}:${lesson.id}`);
                  if (booking?.status === 'attended') attendedCount += 1;
                  if (booking?.status === 'missed') missedCount += 1;
                }

                return (
                  <tr key={student.childId} className="hover:bg-[#FAFAFA]">
                    <td className="sticky left-0 z-10 border-r border-[#E5E7EB] bg-white px-4 py-2.5">
                      <div className="text-sm font-semibold text-[#111827]">
                        <span className="mr-1.5 text-xs font-normal text-[#9CA3AF] tabular-nums">
                          {index + 1}.
                        </span>
                        {student.childName}{' '}
                        <span className="text-xs font-normal text-[#6B7280]">
                          ({pluralizeYears(student.childAge)})
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#6B7280]">{student.parentName}</div>
                    </td>

                    {sortedLessons.map((lesson) => {
                      const booking = bookingCellMap.get(`${student.childId}:${lesson.id}`);
                      const isSelected =
                        selectedCell?.childId === student.childId &&
                        selectedCell?.lessonId === lesson.id;

                      return (
                        <td
                          key={lesson.id}
                          className={`border-r border-[#E5E7EB] p-1 text-center align-middle ${
                            lesson.is_canceled ? 'bg-[#F9FAFB]' : ''
                          }`}
                        >
                          {booking ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCell({ childId: student.childId, lessonId: lesson.id });
                                setCellReason('');
                              }}
                              title={`${student.childName} — ${lesson.title}`}
                              className={`flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border text-sm font-bold transition-all ${cellStyleClasses(
                                booking.status
                              )} ${isSelected ? 'ring-2 ring-[#C86D2D] ring-offset-1' : ''}`}
                            >
                              {cellSymbol(booking.status)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCell({ childId: student.childId, lessonId: lesson.id });
                                setCellReason('');
                              }}
                              title={`${student.childName} — ${lesson.title} (не записан)`}
                              className={`flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border border-dashed text-xs transition-all ${
                                isSelected
                                  ? 'border-[#C86D2D] bg-[#FDF4ED] text-[#C86D2D] ring-2 ring-[#C86D2D] ring-offset-1'
                                  : 'border-[#E5E7EB] bg-[#FAFAFA] text-[#D1D5DB] hover:border-[#C86D2D] hover:text-[#C86D2D]'
                              }`}
                            >
                              ·
                            </button>
                          )}
                        </td>
                      );
                    })}

                    <td className="border-l border-[#E5E7EB] px-2 py-2 text-center text-sm font-bold text-[#065F46] tabular-nums">
                      {attendedCount}
                    </td>
                    <td className="border-l border-[#E5E7EB] px-2 py-2 text-center text-sm font-bold text-[#991B1B] tabular-nums">
                      {missedCount}
                    </td>
                    <td
                      className={`border-l border-[#E5E7EB] px-2 py-2 text-center text-sm font-bold tabular-nums ${
                        student.remainingLessons <= 1 ? 'text-[#92400E]' : 'text-[#111827]'
                      }`}
                    >
                      {student.remainingLessons}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
