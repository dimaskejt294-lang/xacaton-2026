import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BookingStatus, LessonType, MasterFamily, MasterLesson } from '../types.ts';
import {
  WORKSHOP_TIMEZONE,
  bookingStatusClasses,
  bookingStatusLabel,
  formatMoney,
  formatSurgutTime,
  formatSurgutTimeRange,
  lessonTypeBadgeClasses,
  lessonTypeLabel,
  pluralizeLessons,
  pluralizeYears,
  toSurgutDateKey,
} from '../utils/format.ts';

interface ScheduleCalendarViewProps {
  lessons: MasterLesson[];
  families: MasterFamily[];
  onMarkStatus: (bookingId: number, status: BookingStatus, reason?: string) => Promise<void>;
  onEnrollChild: (lessonId: number, childId: number) => Promise<void>;
  onConvertWaitlist: (waitlistId: number) => Promise<void>;
  onEditLesson: (lesson: MasterLesson) => void;
  onCancelLesson: (lessonId: number) => Promise<void>;
  onCreateLessonOnDate: (dateKey: string) => void;
  onSelectStudent?: (familyId: number, childId?: number) => void;
}

type CalendarMode = 'month' | 'week';
type RosterSubTab = 'enrolled' | 'unenrolled';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

const ALL_FORMATS: ReadonlyArray<{ id: LessonType; short: string; label: string }> = [
  { id: 'group', short: 'Гр.', label: 'Группы' },
  { id: 'masterclass', short: 'МК', label: 'Мастер-классы' },
  { id: 'individual', short: 'Инд.', label: 'Индивидуальные' },
  { id: 'birthday', short: 'ДР', label: 'Дни рождения' },
];

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 7, 0, 0));
}

function getMondayOfWeek(date: Date): Date {
  const key = toSurgutDateKey(date);
  const d = parseDateKey(key);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

function formatMonthTitleRu(monthDate: Date): string {
  const raw = monthDate.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: WORKSHOP_TIMEZONE,
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatWeekRangeTitleRu(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const startStr = weekStart.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: WORKSHOP_TIMEZONE,
  });
  const endStr = weekEnd.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: WORKSHOP_TIMEZONE,
  });
  return `${startStr} – ${endStr}`;
}

function formatDayHeadingRu(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const raw = date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: WORKSHOP_TIMEZONE,
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatHoursRu(totalMinutes: number): string {
  const hours = totalMinutes / 60;
  if (Number.isInteger(hours)) return `${hours} ч`;
  return `${hours.toFixed(1).replace('.0', '')} ч`;
}

function pluralizeEvents(count: number): string {
  const abs = Math.abs(count) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return `${count} событий`;
  if (n1 > 1 && n1 < 5) return `${count} события`;
  if (n1 === 1) return `${count} событие`;
  return `${count} событий`;
}

export const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
  lessons,
  families,
  onMarkStatus,
  onEnrollChild,
  onConvertWaitlist,
  onEditLesson,
  onCancelLesson,
  onCreateLessonOnDate,
  onSelectStudent,
}) => {
  const todayKey = useMemo(() => toSurgutDateKey(new Date()), []);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const today = parseDateKey(toSurgutDateKey(new Date()));
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 7, 0, 0));
  });
  const [weekAnchorDate, setWeekAnchorDate] = useState<Date>(() => getMondayOfWeek(new Date()));

  const [formatFilter, setFormatFilter] = useState<'all' | LessonType>('all');
  const [showCanceled, setShowCanceled] = useState(false);

  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [rosterSubTab, setRosterSubTab] = useState<RosterSubTab>('enrolled');
  const [unenrolledSearch, setUnenrolledSearch] = useState('');
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [enrollingChildId, setEnrollingChildId] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);

  const dayDrilldownRef = useRef<HTMLDivElement | null>(null);

  const filteredLessons = useMemo(
    () =>
      lessons.filter(
        (l) =>
          (showCanceled || l.is_canceled === 0) &&
          (formatFilter === 'all' || l.lesson_type === formatFilter)
      ),
    [lessons, showCanceled, formatFilter]
  );

  // Map YYYY-MM-DD -> sorted lessons on that date
  const lessonsByDate = useMemo(() => {
    const map = new Map<string, MasterLesson[]>();
    for (const lesson of filteredLessons) {
      const key = toSurgutDateKey(lesson.start_time);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(lesson);
      map.set(key, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }
    return map;
  }, [filteredLessons]);

  const monthCells = useMemo(() => {
    const year = viewMonth.getUTCFullYear();
    const month = viewMonth.getUTCMonth();
    const firstOfMonth = new Date(Date.UTC(year, month, 1, 7, 0, 0));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 7, 0, 0)).getUTCDate();
    const startOffset = (firstOfMonth.getUTCDay() + 6) % 7;
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: Array<{
      dateKey: string;
      dayNumber: number;
      monthShort: string;
      inCurrentMonth: boolean;
      isWeekend: boolean;
    }> = [];

    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(Date.UTC(year, month, 1 - startOffset + i, 7, 0, 0));
      const dayOfWeek = cellDate.getUTCDay();
      cells.push({
        dateKey: toSurgutDateKey(cellDate),
        dayNumber: cellDate.getUTCDate(),
        monthShort: cellDate.toLocaleDateString('ru-RU', {
          month: 'short',
          timeZone: WORKSHOP_TIMEZONE,
        }),
        inCurrentMonth: cellDate.getUTCMonth() === month,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }
    return cells;
  }, [viewMonth]);

  const weekDays = useMemo(() => {
    const days: Array<{
      dateKey: string;
      dayNumber: number;
      weekdayShort: string;
      monthShort: string;
      isWeekend: boolean;
    }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAnchorDate);
      d.setUTCDate(d.getUTCDate() + i);
      const dow = d.getUTCDay();
      days.push({
        dateKey: toSurgutDateKey(d),
        dayNumber: d.getUTCDate(),
        weekdayShort: WEEKDAY_LABELS[i],
        monthShort: d.toLocaleDateString('ru-RU', {
          month: 'short',
          timeZone: WORKSHOP_TIMEZONE,
        }),
        isWeekend: dow === 0 || dow === 6,
      });
    }
    return days;
  }, [weekAnchorDate]);

  // Workload summary for the currently visible period (month or week), respecting showCanceled (ignoring formatFilter so counts per format stay informative)
  const visiblePeriodWorkload = useMemo(() => {
    const visibleKeys = new Set(
      calendarMode === 'week'
        ? weekDays.map((d) => d.dateKey)
        : monthCells.filter((c) => c.inCurrentMonth).map((c) => c.dateKey)
    );

    let totalEvents = 0;
    let totalMinutes = 0;
    let totalBooked = 0;
    let totalCapacity = 0;
    const byType: Record<LessonType, number> = {
      group: 0,
      masterclass: 0,
      individual: 0,
      birthday: 0,
    };

    for (const l of lessons) {
      if (l.is_canceled === 1) continue;
      const key = toSurgutDateKey(l.start_time);
      if (!visibleKeys.has(key)) continue;
      totalEvents += 1;
      totalMinutes += l.duration_minutes;
      totalBooked += l.booked_count;
      totalCapacity += l.capacity;
      byType[l.lesson_type] = (byType[l.lesson_type] ?? 0) + 1;
    }

    return { totalEvents, totalMinutes, totalBooked, totalCapacity, byType };
  }, [lessons, calendarMode, weekDays, monthCells]);

  const dayLessons = useMemo(
    () => lessonsByDate.get(selectedDateKey) ?? [],
    [lessonsByDate, selectedDateKey]
  );

  // Sync selectedLessonId with the chosen date
  useEffect(() => {
    if (dayLessons.length === 0) {
      setSelectedLessonId(null);
      return;
    }
    const stillExists = dayLessons.some((l) => l.id === selectedLessonId);
    if (!stillExists) {
      const firstActive = dayLessons.find((l) => l.is_canceled === 0) ?? dayLessons[0];
      setSelectedLessonId(firstActive.id);
    }
  }, [dayLessons, selectedLessonId]);

  const selectedLesson = useMemo(
    () => dayLessons.find((l) => l.id === selectedLessonId) ?? null,
    [dayLessons, selectedLessonId]
  );

  useEffect(() => {
    setConfirmCancelId(null);
    setUnenrolledSearch('');
  }, [selectedLessonId]);

  const allChildren = useMemo(() => {
    const items: Array<{
      id: number;
      familyId: number;
      name: string;
      age: number;
      parentName: string;
      phone: string;
      remainingLessons: number;
    }> = [];
    for (const fam of families) {
      for (const child of fam.children) {
        items.push({
          id: child.id,
          familyId: fam.id,
          name: child.name,
          age: child.age,
          parentName: fam.parent_name,
          phone: fam.phone,
          remainingLessons: fam.remaining_lessons,
        });
      }
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [families]);

  const unenrolledChildren = useMemo(() => {
    if (!selectedLesson) return [];
    const activeChildIds = new Set(
      selectedLesson.bookings
        .filter((b) => b.status !== 'canceled')
        .map((b) => b.child_id)
    );
    return allChildren.filter((c) => !activeChildIds.has(c.id));
  }, [allChildren, selectedLesson]);

  const filteredUnenrolledChildren = useMemo(() => {
    const q = unenrolledSearch.trim().toLowerCase();
    if (!q) return unenrolledChildren;
    return unenrolledChildren.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.parentName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [unenrolledChildren, unenrolledSearch]);

  const activeBookings = useMemo(() => {
    if (!selectedLesson) return [];
    return selectedLesson.bookings.filter((b) => b.status !== 'canceled');
  }, [selectedLesson]);

  const canceledBookings = useMemo(() => {
    if (!selectedLesson) return [];
    return selectedLesson.bookings.filter((b) => b.status === 'canceled');
  }, [selectedLesson]);

  const attendedCount = activeBookings.filter((b) => b.status === 'attended').length;

  const dayTotalMinutes = useMemo(
    () =>
      dayLessons
        .filter((l) => l.is_canceled === 0)
        .reduce((sum, l) => sum + l.duration_minutes, 0),
    [dayLessons]
  );

  const handleSwitchMode = (mode: CalendarMode) => {
    setCalendarMode(mode);
    const chosen = parseDateKey(selectedDateKey);
    if (mode === 'week') {
      setWeekAnchorDate(getMondayOfWeek(chosen));
    } else {
      setViewMonth(new Date(Date.UTC(chosen.getUTCFullYear(), chosen.getUTCMonth(), 1, 7, 0, 0)));
    }
  };

  const handleNavigatePeriod = (delta: number) => {
    if (calendarMode === 'month') {
      setViewMonth(
        (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + delta, 1, 7, 0, 0))
      );
    } else {
      setWeekAnchorDate((prev) => {
        const next = new Date(prev);
        next.setUTCDate(next.getUTCDate() + delta * 7);
        return next;
      });
    }
  };

  const handleJumpToday = () => {
    const today = parseDateKey(todayKey);
    setViewMonth(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 7, 0, 0)));
    setWeekAnchorDate(getMondayOfWeek(today));
    setSelectedDateKey(todayKey);
  };

  const handleDrillIntoDay = (dateKey: string, specificLessonId?: number) => {
    setSelectedDateKey(dateKey);
    const parsed = parseDateKey(dateKey);
    setViewMonth(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1, 7, 0, 0)));
    setWeekAnchorDate(getMondayOfWeek(parsed));
    if (specificLessonId !== undefined) {
      setSelectedLessonId(specificLessonId);
    }
    if (window.innerWidth < 1024 && dayDrilldownRef.current) {
      setTimeout(() => {
        dayDrilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    }
  };

  const handleToggleAttendanceCheckbox = async (bookingId: number, currentStatus: BookingStatus) => {
    const nextStatus: BookingStatus = currentStatus === 'attended' ? 'booked' : 'attended';
    setBusyBookingId(bookingId);
    try {
      await onMarkStatus(bookingId, nextStatus);
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleSetExplicitStatus = async (bookingId: number, nextStatus: BookingStatus) => {
    setBusyBookingId(bookingId);
    try {
      await onMarkStatus(bookingId, nextStatus);
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleQuickEnrollChild = async (childId: number) => {
    if (!selectedLesson) return;
    setEnrollingChildId(childId);
    try {
      await onEnrollChild(selectedLesson.id, childId);
    } finally {
      setEnrollingChildId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Calendar Card (Month / Week + Workload Strip) */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5">
        {/* Top Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Month / Week Switcher */}
            <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-1">
              <button
                type="button"
                onClick={() => handleSwitchMode('month')}
                className={`min-h-[34px] cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors ${
                  calendarMode === 'month'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Месяц
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('week')}
                className={`min-h-[34px] cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors ${
                  calendarMode === 'week'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Неделя
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleNavigatePeriod(-1)}
                aria-label={calendarMode === 'month' ? 'Предыдущий месяц' : 'Предыдущая неделя'}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB]"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <h3 className="min-w-[165px] text-center font-display text-sm font-bold text-[#111827] sm:text-base">
                {calendarMode === 'month'
                  ? formatMonthTitleRu(viewMonth)
                  : formatWeekRangeTitleRu(weekAnchorDate)}
              </h3>
              <button
                type="button"
                onClick={() => handleNavigatePeriod(1)}
                aria-label={calendarMode === 'month' ? 'Следующий месяц' : 'Следующая неделя'}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB]"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#6B7280]">
              <input
                type="checkbox"
                checked={showCanceled}
                onChange={(e) => setShowCanceled(e.target.checked)}
                className="h-4 w-4 rounded border-[#D1D5DB] accent-[#C86D2D]"
              />
              Отменённые
            </label>

            <button
              type="button"
              onClick={handleJumpToday}
              className={`min-h-[38px] cursor-pointer rounded-xl border px-3.5 text-xs font-semibold transition-colors ${
                selectedDateKey === todayKey
                  ? 'border-[#C86D2D] bg-[#FDF4ED] text-[#C86D2D]'
                  : 'border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB]'
              }`}
            >
              Сегодня
            </button>
          </div>
        </div>

        {/* Workload Summary & Format Filter Strip */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-semibold text-[#111827]">
              Нагрузка за {calendarMode === 'month' ? 'месяц' : 'неделю'}:
            </span>
            <span className="text-[#374151] tabular-nums">
              <strong>{pluralizeEvents(visiblePeriodWorkload.totalEvents)}</strong> ·{' '}
              <strong>{formatHoursRu(visiblePeriodWorkload.totalMinutes)}</strong>
            </span>
            <span className="text-[#6B7280] tabular-nums">
              Учеников записано:{' '}
              <strong className="text-[#111827]">
                {visiblePeriodWorkload.totalBooked} из {visiblePeriodWorkload.totalCapacity}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFormatFilter('all')}
              className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                formatFilter === 'all'
                  ? 'border-[#111827] bg-[#111827] text-white'
                  : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Все ({visiblePeriodWorkload.totalEvents})
            </button>
            {ALL_FORMATS.map((fmt) => {
              const count = visiblePeriodWorkload.byType[fmt.id] ?? 0;
              const isActive = formatFilter === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setFormatFilter((prev) => (prev === fmt.id ? 'all' : fmt.id))}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all tabular-nums ${
                    isActive
                      ? 'border-[#C86D2D] bg-[#C86D2D] text-white shadow-xs'
                      : `${lessonTypeBadgeClasses(fmt.id)} hover:opacity-85`
                  }`}
                >
                  {fmt.label}: {count}
                </button>
              );
            })}
          </div>
        </div>

        {/* MONTH VIEW */}
        {calendarMode === 'month' ? (
          <>
            <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-[#6B7280]">
              {WEEKDAY_LABELS.map((day, idx) => (
                <div key={day} className={`py-1.5 ${idx >= 5 ? 'text-[#C86D2D]' : ''}`}>
                  {day}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {monthCells.map((cell) => {
                const list = lessonsByDate.get(cell.dateKey) ?? [];
                const isToday = cell.dateKey === todayKey;
                const isSelected = cell.dateKey === selectedDateKey;
                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => handleDrillIntoDay(cell.dateKey)}
                    className={`group flex min-h-[76px] cursor-pointer flex-col justify-between rounded-xl border p-1.5 text-left transition-all sm:min-h-[104px] sm:p-2 ${
                      isSelected
                        ? 'border-[#C86D2D] bg-[#FDF4ED] ring-2 ring-[#C86D2D]/25'
                        : isToday
                          ? 'border-[#F59E0B] bg-[#FFFBEB]/60 hover:border-[#C86D2D]'
                          : cell.inCurrentMonth
                            ? cell.isWeekend
                              ? 'border-[#E5E7EB] bg-[#FAFAFA] hover:border-[#D1D5DB] hover:bg-white'
                              : 'border-[#E5E7EB] bg-white hover:border-[#D1D5DB] hover:bg-[#F9FAFB]'
                            : 'border-[#F3F4F6] bg-[#F9FAFB]/60 text-[#9CA3AF] hover:bg-[#F3F4F6]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-lg px-1 text-xs font-semibold tabular-nums ${
                          isToday
                            ? 'bg-[#C86D2D] text-white'
                            : cell.inCurrentMonth
                              ? 'text-[#111827]'
                              : 'text-[#9CA3AF]'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                      {list.length > 0 && (
                        <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-[#374151] shadow-xs tabular-nums">
                          {list.length}
                        </span>
                      )}
                    </div>

                    {list.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        <div className="hidden space-y-0.5 sm:block">
                          {list.slice(0, 3).map((lesson) => (
                            <div
                              key={lesson.id}
                              className={`truncate rounded border px-1 py-0.5 text-[10px] font-medium leading-tight tabular-nums ${
                                lesson.is_canceled
                                  ? 'border-slate-200 bg-slate-100 text-[#9CA3AF] line-through'
                                  : lessonTypeBadgeClasses(lesson.lesson_type)
                              }`}
                              title={`${formatSurgutTime(lesson.start_time)} ${lessonTypeLabel(lesson.lesson_type)} — ${lesson.title}`}
                            >
                              {formatSurgutTime(lesson.start_time)} {lesson.title}
                            </div>
                          ))}
                          {list.length > 3 && (
                            <div className="px-1 text-[10px] font-medium text-[#6B7280]">
                              +{list.length - 3} ещё
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 sm:hidden">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#C86D2D]" />
                          <span className="text-[10px] font-medium text-[#111827]">
                            {list.length}
                          </span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          /* WEEK VIEW */
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
            {weekDays.map((day) => {
              const list = lessonsByDate.get(day.dateKey) ?? [];
              const activeMinutes = list
                .filter((l) => l.is_canceled === 0)
                .reduce((acc, l) => acc + l.duration_minutes, 0);
              const isToday = day.dateKey === todayKey;
              const isSelected = day.dateKey === selectedDateKey;

              return (
                <div
                  key={day.dateKey}
                  className={`flex min-h-[170px] flex-col rounded-xl border p-2.5 transition-all ${
                    isSelected
                      ? 'border-[#C86D2D] bg-[#FDF4ED]/55 ring-2 ring-[#C86D2D]/20'
                      : isToday
                        ? 'border-[#F59E0B] bg-[#FFFBEB]/40'
                        : day.isWeekend
                          ? 'border-[#E5E7EB] bg-[#FAFAFA]'
                          : 'border-[#E5E7EB] bg-white'
                  }`}
                >
                  {/* Day column header (click to drill into day) */}
                  <button
                    type="button"
                    onClick={() => handleDrillIntoDay(day.dateKey)}
                    className="flex w-full cursor-pointer items-center justify-between border-b border-[#E5E7EB]/70 pb-2 text-left"
                  >
                    <div>
                      <span
                        className={`text-xs font-bold ${
                          day.isWeekend ? 'text-[#C86D2D]' : 'text-[#6B7280]'
                        }`}
                      >
                        {day.weekdayShort}
                      </span>{' '}
                      <span
                        className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-md px-1 text-xs font-bold tabular-nums ${
                          isToday ? 'bg-[#C86D2D] text-white' : 'text-[#111827]'
                        }`}
                      >
                        {day.dayNumber}
                      </span>{' '}
                      <span className="text-[11px] text-[#6B7280]">{day.monthShort}</span>
                    </div>
                    {list.length > 0 && (
                      <span className="text-[10px] font-semibold text-[#6B7280] tabular-nums">
                        {formatHoursRu(activeMinutes)}
                      </span>
                    )}
                  </button>

                  {/* Day events */}
                  <div className="mt-2 flex-1 space-y-1.5">
                    {list.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleDrillIntoDay(day.dateKey)}
                        className="flex h-full min-h-[84px] w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#E5E7EB] text-[11px] text-[#9CA3AF] hover:border-[#C86D2D] hover:text-[#C86D2D]"
                      >
                        Свободно
                      </button>
                    ) : (
                      list.map((lesson) => {
                        const isLessonSelected = lesson.id === selectedLessonId && isSelected;
                        return (
                          <button
                            key={lesson.id}
                            type="button"
                            onClick={() => handleDrillIntoDay(day.dateKey, lesson.id)}
                            className={`w-full cursor-pointer rounded-lg border p-2 text-left transition-all ${
                              lesson.is_canceled
                                ? 'border-slate-200 bg-slate-100 opacity-60'
                                : isLessonSelected
                                  ? 'border-[#C86D2D] bg-white shadow-xs ring-1 ring-[#C86D2D]'
                                  : 'border-[#E5E7EB] bg-white hover:border-[#C86D2D]/60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-bold text-[#111827] tabular-nums">
                                {formatSurgutTime(lesson.start_time)}
                              </span>
                              <span className="text-[10px] font-semibold text-[#6B7280] tabular-nums">
                                {lesson.booked_count}/{lesson.capacity}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-xs font-semibold text-[#111827]">
                              {lesson.title}
                            </div>
                            <span
                              className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${lessonTypeBadgeClasses(
                                lesson.lesson_type
                              )}`}
                            >
                              {lessonTypeLabel(lesson.lesson_type)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Day Drill-Down + Selected Event Roster (Enrolled vs Unenrolled) */}
      <div ref={dayDrilldownRef} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Day Schedule (Groups, Masterclasses, Individual, Birthdays) */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5 lg:col-span-5">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#F3F4F6] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.75} />
                <span className="text-xs font-medium text-[#6B7280]">Расписание дня</span>
                {selectedDateKey === todayKey && (
                  <span className="rounded-md bg-[#FDF4ED] px-2 py-0.5 text-[11px] font-semibold text-[#C86D2D]">
                    Сегодня
                  </span>
                )}
              </div>
              <h3 className="mt-1 font-display text-base font-bold text-[#111827]">
                {formatDayHeadingRu(selectedDateKey)}
              </h3>
              <p className="mt-0.5 text-xs text-[#6B7280] tabular-nums">
                {dayLessons.length > 0
                  ? `${pluralizeEvents(dayLessons.length)} · нагрузка ${formatHoursRu(dayTotalMinutes)}`
                  : 'На этот день ничего не запланировано'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onCreateLessonOnDate(selectedDateKey)}
              className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#111827] hover:border-[#C86D2D] hover:bg-[#FDF4ED] hover:text-[#C86D2D]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Добавить
            </button>
          </div>

          {dayLessons.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[#6B7280]">На выбранную дату занятий и событий нет.</p>
              <button
                type="button"
                onClick={() => onCreateLessonOnDate(selectedDateKey)}
                className="mt-3 inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-4 text-xs font-semibold text-white hover:bg-[#B05B20]"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                Добавить занятие / мастер-класс
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {dayLessons.map((lesson) => {
                const isSelected = lesson.id === selectedLessonId;
                const activeCount = lesson.bookings.filter((b) => b.status !== 'canceled').length;
                const doneCount = lesson.bookings.filter((b) => b.status === 'attended').length;
                const isFull = lesson.free_spots === 0;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className={`w-full cursor-pointer rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? 'border-[#C86D2D] bg-[#FDF4ED] shadow-xs'
                        : 'border-[#E5E7EB] bg-[#F9FAFB] hover:border-[#D1D5DB] hover:bg-white'
                    } ${lesson.is_canceled ? 'opacity-65' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#111827] tabular-nums">
                          <Clock className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
                          {formatSurgutTimeRange(lesson.start_time, lesson.duration_minutes)}
                        </span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${lessonTypeBadgeClasses(
                            lesson.lesson_type
                          )}`}
                        >
                          {lessonTypeLabel(lesson.lesson_type)}
                        </span>
                      </div>

                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                          lesson.is_canceled
                            ? 'bg-slate-100 text-[#6B7280]'
                            : isFull
                              ? 'bg-[#FEF2F2] text-[#991B1B]'
                              : 'bg-[#ECFDF5] text-[#065F46]'
                        }`}
                      >
                        {lesson.is_canceled
                          ? 'Отменено'
                          : `${lesson.booked_count} / ${lesson.capacity} мест`}
                      </span>
                    </div>

                    <div className="mt-1.5 font-display text-sm font-bold text-[#111827]">
                      {lesson.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B7280] tabular-nums">
                      <span>{lesson.duration_minutes} мин</span>
                      <span>·</span>
                      <span>Записано: {activeCount}</span>
                      {doneCount > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-[#065F46]">
                            Пришли: {doneCount}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Selected Event Roster ("Кто записан" & "Кто не записан") */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5 lg:col-span-7">
          {!selectedLesson ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <Users className="h-8 w-8 text-[#D1D5DB]" strokeWidth={1.5} />
              <div className="mt-2 font-display text-sm font-semibold text-[#111827]">
                Нажмите на день и выберите занятие или мастер-класс
              </div>
              <p className="mt-1 max-w-sm text-xs text-[#6B7280]">
                Здесь сразу отобразится список записанных и незаписанных учеников, а также
                галочки посещения.
              </p>
            </div>
          ) : (
            <div>
              {/* Event Header */}
              <div className="flex flex-col justify-between gap-3 border-b border-[#F3F4F6] pb-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280] tabular-nums">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${lessonTypeBadgeClasses(
                        selectedLesson.lesson_type
                      )}`}
                    >
                      {lessonTypeLabel(selectedLesson.lesson_type)}
                    </span>
                    <span className="font-semibold text-[#111827]">
                      {formatSurgutTimeRange(selectedLesson.start_time, selectedLesson.duration_minutes)}
                    </span>
                    <span>·</span>
                    <span>{formatMoney(selectedLesson.single_price)}</span>
                  </div>
                  <h3 className="mt-1.5 font-display text-lg font-bold text-[#111827]">
                    {selectedLesson.title}
                    {selectedLesson.is_canceled === 1 && ' (Отменено)'}
                  </h3>
                  <div className="mt-1 text-xs text-[#6B7280] tabular-nums">
                    Записано: <strong className="text-[#111827]">{activeBookings.length}</strong> из{' '}
                    <strong className="text-[#111827]">{selectedLesson.capacity}</strong> ·
                    Свободно: <strong className="text-[#111827]">{selectedLesson.free_spots}</strong> ·
                    Пришли: <strong className="text-[#065F46]">{attendedCount}</strong>
                  </div>
                </div>

                {selectedLesson.is_canceled === 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEditLesson(selectedLesson)}
                      className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                    >
                      <Pencil className="h-3.5 w-3.5 text-[#6B7280]" strokeWidth={1.5} />
                      Редактировать
                    </button>

                    {confirmCancelId === selectedLesson.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void onCancelLesson(selectedLesson.id)}
                          className="min-h-[38px] cursor-pointer rounded-xl bg-[#991B1B] px-3 text-xs font-medium text-white"
                        >
                          Подтвердить отмену
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(null)}
                          className="min-h-[38px] cursor-pointer rounded-xl border border-[#E5E7EB] px-2.5 text-xs text-[#6B7280]"
                        >
                          Нет
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(selectedLesson.id)}
                        className="min-h-[38px] cursor-pointer rounded-xl border border-[#E5E7EB] px-3 text-xs font-medium text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                      >
                        Отменить
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Switcher: Who IS enrolled vs Who is NOT enrolled */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-1">
                  <button
                    type="button"
                    onClick={() => setRosterSubTab('enrolled')}
                    className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                      rosterSubTab === 'enrolled'
                        ? 'bg-[#C86D2D] text-white shadow-xs'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Кто записан ({activeBookings.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterSubTab('unenrolled')}
                    className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                      rosterSubTab === 'unenrolled'
                        ? 'bg-[#C86D2D] text-white shadow-xs'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Кто не записан ({unenrolledChildren.length})
                  </button>
                </div>

                {rosterSubTab === 'enrolled' && (
                  <span className="text-[11px] text-[#6B7280]">
                    Галочка слева — отметка посещения
                  </span>
                )}
              </div>

              {/* SUBTAB 1: ENROLLED STUDENTS */}
              {rosterSubTab === 'enrolled' ? (
                <div className="mt-3">
                  {activeBookings.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-5 text-center">
                      <p className="text-sm text-[#6B7280]">
                        На это занятие пока никто не записан.
                      </p>
                      {selectedLesson.is_canceled === 0 && (
                        <button
                          type="button"
                          onClick={() => setRosterSubTab('unenrolled')}
                          className="mt-2.5 inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3.5 text-xs font-semibold text-white hover:bg-[#B05B20]"
                        >
                          <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Открыть список незаписанных
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeBookings.map((b) => {
                        const isAttended = b.status === 'attended';
                        const isBusy = busyBookingId === b.id;
                        return (
                          <div
                            key={b.id}
                            className={`flex flex-col justify-between gap-2.5 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center ${
                              isAttended
                                ? 'border-[#A7F3D0] bg-[#ECFDF5]/60'
                                : 'border-[#E5E7EB] bg-[#F9FAFB]'
                            }`}
                          >
                            <div className="flex items-start gap-3 sm:items-center">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={isAttended}
                                aria-label={`Отметить посещение: ${b.child_name}`}
                                disabled={isBusy}
                                onClick={() => void handleToggleAttendanceCheckbox(b.id, b.status)}
                                title={
                                  isAttended ? 'Снять отметку посещения' : 'Отметить, что пришёл'
                                }
                                className={`mt-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 transition-all sm:mt-0 ${
                                  isAttended
                                    ? 'border-[#065F46] bg-[#065F46] text-white shadow-xs'
                                    : 'border-[#D1D5DB] bg-white text-transparent hover:border-[#065F46]'
                                } disabled:opacity-50`}
                              >
                                <Check className="h-4 w-4" strokeWidth={2.5} />
                              </button>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onSelectStudent?.(b.family_id, b.child_id)}
                                    title="Нажмите, чтобы открыть карточку ученика (ФИО, возраст, почта, MAX, ссылка для входа)"
                                    className="cursor-pointer text-left font-semibold text-[#111827] hover:text-[#C86D2D] hover:underline"
                                  >
                                    {b.child_name} ({pluralizeYears(b.child_age)})
                                  </button>
                                  <span
                                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${bookingStatusClasses(
                                      b.status
                                    )}`}
                                  >
                                    {bookingStatusLabel(b.status)}
                                  </span>
                                  {b.is_makeup === 1 && (
                                    <span className="text-[11px] font-medium text-[#C86D2D]">
                                      Отработка
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[#6B7280] tabular-nums">
                                  <span>{b.parent_name}</span>
                                  <span>·</span>
                                  <span>{b.phone}</span>
                                  {b.max_contact && (
                                    <>
                                      <span>·</span>
                                      <span className="font-medium text-[#C86D2D]">MAX: {b.max_contact}</span>
                                    </>
                                  )}
                                  <span>·</span>
                                  <span>{b.is_charged ? 'Списано' : 'Не списано'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 pl-10 sm:pl-0">
                              <button
                                type="button"
                                onClick={() => onSelectStudent?.(b.family_id, b.child_id)}
                                className="min-h-[34px] cursor-pointer rounded-lg border border-[#C86D2D]/40 bg-[#FDF4ED] px-2.5 text-xs font-semibold text-[#C86D2D] hover:bg-[#FCE8D8]"
                              >
                                Карточка
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSetExplicitStatus(b.id, 'missed')}
                                className={`min-h-[34px] cursor-pointer rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                                  b.status === 'missed'
                                    ? 'bg-[#991B1B] text-white'
                                    : 'border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#FEF2F2] hover:text-[#991B1B]'
                                }`}
                              >
                                Пропустил
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSetExplicitStatus(b.id, 'canceled')}
                                className="min-h-[34px] cursor-pointer rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium text-[#6B7280] hover:bg-[#F3F4F6] disabled:opacity-50"
                              >
                                Убрать
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {canceledBookings.length > 0 && (
                    <details className="mt-3 text-xs text-[#6B7280]">
                      <summary className="cursor-pointer font-medium hover:text-[#111827]">
                        Отменённые записи ({canceledBookings.length})
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        {canceledBookings.map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2"
                          >
                            <button
                              type="button"
                              onClick={() => onSelectStudent?.(b.family_id, b.child_id)}
                              className="cursor-pointer text-left font-medium text-[#111827] hover:text-[#C86D2D] hover:underline"
                            >
                              {b.child_name} ({b.parent_name})
                            </button>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px]">
                              Отмена
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                /* SUBTAB 2: UNENROLLED STUDENTS (with instant search + 1-click enroll) */
                <div className="mt-3 space-y-3">
                  {selectedLesson.free_spots === 0 && (
                    <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5 text-xs text-[#92400E]">
                      Основные места заняты ({selectedLesson.booked_count} из{' '}
                      {selectedLesson.capacity}). Мастер может записать ученика сверх лимита группы.
                    </div>
                  )}

                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
                      strokeWidth={1.75}
                    />
                    <input
                      type="text"
                      value={unenrolledSearch}
                      onChange={(e) => setUnenrolledSearch(e.target.value)}
                      placeholder="Поиск по имени ребёнка, родителя или телефону..."
                      className="min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] pr-3 pl-9 text-xs text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                    />
                  </div>

                  {filteredUnenrolledChildren.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-4 text-center text-xs text-[#6B7280]">
                      {unenrolledChildren.length === 0
                        ? 'Все ученики из базы уже записаны на это занятие.'
                        : 'По запросу никого не найдено.'}
                    </div>
                  ) : (
                    <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                      {filteredUnenrolledChildren.map((c) => {
                        const isEnrollingThis = enrollingChildId === c.id;
                        const canEnroll = selectedLesson.is_canceled === 0;
                        return (
                          <div
                            key={c.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onSelectStudent?.(c.familyId, c.id)}
                                title="Открыть карточку ученика"
                                className="cursor-pointer text-left text-sm font-semibold text-[#111827] hover:text-[#C86D2D] hover:underline"
                              >
                                {c.name}{' '}
                                <span className="text-xs font-normal text-[#6B7280]">
                                  ({pluralizeYears(c.age)})
                                </span>
                              </button>
                              <div className="text-xs text-[#6B7280] tabular-nums">
                                {c.parentName} · {c.phone} · Остаток:{' '}
                                <strong
                                  className={
                                    c.remainingLessons === 0 ? 'text-[#92400E]' : 'text-[#065F46]'
                                  }
                                >
                                  {pluralizeLessons(c.remainingLessons)}
                                </strong>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onSelectStudent?.(c.familyId, c.id)}
                                className="min-h-[36px] cursor-pointer rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                              >
                                Карточка
                              </button>
                              {canEnroll && (
                                <button
                                  type="button"
                                  disabled={isEnrollingThis}
                                  onClick={() => void handleQuickEnrollChild(c.id)}
                                  className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg bg-[#C86D2D] px-3 text-xs font-semibold text-white hover:bg-[#B05B20] disabled:opacity-50"
                                >
                                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                                  {isEnrollingThis
                                    ? 'Запись...'
                                    : selectedLesson.free_spots === 0
                                      ? 'Записать сверх лимита'
                                      : 'Записать'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Waitlist if any */}
              {selectedLesson.waitlist.length > 0 && (
                <div className="mt-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5">
                  <div className="text-xs font-semibold text-[#92400E]">
                    Лист ожидания ({selectedLesson.waitlist.length})
                  </div>
                  <div className="mt-2 space-y-2">
                    {selectedLesson.waitlist.map((w) => (
                      <div
                        key={w.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => w.family_id && onSelectStudent?.(w.family_id, w.child_id)}
                          className="cursor-pointer text-left font-medium text-[#111827] hover:text-[#C86D2D] hover:underline"
                        >
                          {w.child_name} ({w.parent_name}, {w.phone})
                        </button>
                        {selectedLesson.is_canceled === 0 && (
                          <button
                            type="button"
                            onClick={() => void onConvertWaitlist(w.id)}
                            className="min-h-[34px] cursor-pointer rounded-lg bg-[#C86D2D] px-3 font-medium text-white hover:bg-[#B05B20]"
                          >
                            Перевести в группу
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
