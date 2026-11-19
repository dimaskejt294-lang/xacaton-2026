import {
  ArrowRight,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hammer,
  KeyRound,
  MapPin,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useMemo, useState } from 'react';
import craftFormatsImg from '../assets/images/yasna_craft_formats_1794650010759.jpg';
import workshopHeroImg from '../assets/images/yasna_workshop_hero_1794650010140.jpg';
import type {
  ChildProfile,
  LegalDocKey,
  LegalDocumentItem,
  LessonType,
  ParentBooking,
  PublicLesson,
  ReviewItem,
  Tariff,
  WaitlistEntry,
  WorkshopSettings,
} from '../types.ts';
import {
  formatDateRu,
  formatDateTimeRu,
  formatMoney,
  formatSurgutTime,
  lessonTypeLabel,
  pluralizeLessons,
  toSurgutDateKey,
} from '../utils/format.ts';
import {
  buildMonthCalendarCells,
  formatLongDateRu,
  formatShortDateRu,
  formatYearMonthRu,
  getAvailableCalendarMonths,
  groupWeekendSlots,
} from '../utils/scheduleGroups.ts';
import { LegalDocumentModal } from './LegalDocumentModal.tsx';

interface PublicSchedulePageProps {
  onNavigate: (path: string) => void;
  savedFamilyToken: string | null;
  onTokenValid?: (token: string) => void;
  onTokenInvalid?: () => void;
}

interface PublicScheduleResponse {
  lessons: PublicLesson[];
  tariffs: Tariff[];
  settings: WorkshopSettings;
  reviews: ReviewItem[];
  legal_documents?: LegalDocumentItem[];
}

export const PublicSchedulePage: React.FC<PublicSchedulePageProps> = ({
  onNavigate,
  savedFamilyToken,
  onTokenValid,
  onTokenInvalid,
}) => {
  const [data, setData] = useState<PublicScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | LessonType>('all');

  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resolvingLink, setResolvingLink] = useState(false);

  const [cabinetMode, setCabinetMode] = useState<'login' | 'register'>('login');
  const [regChildren, setRegChildren] = useState<Array<{ name: string; age: string }>>([
    { name: '', age: '10' },
  ]);
  const [regParentName, setRegParentName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMax, setRegMax] = useState('');
  const [regPersonalDataConsent, setRegPersonalDataConsent] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);
  const [copiedRegLink, setCopiedRegLink] = useState(false);
  const [previewLegalDoc, setPreviewLegalDoc] = useState<LegalDocumentItem | null>(null);

  const [familyChildren, setFamilyChildren] = useState<ChildProfile[]>([]);
  const [familyBookings, setFamilyBookings] = useState<ParentBooking[]>([]);
  const [familyWaitlist, setFamilyWaitlist] = useState<WaitlistEntry[]>([]);
  const [pendingLesson, setPendingLesson] = useState<PublicLesson | null>(null);
  const [busyLessonId, setBusyLessonId] = useState<number | null>(null);
  const [pickingChildLessonId, setPickingChildLessonId] = useState<number | null>(null);
  const [bookingMessages, setBookingMessages] = useState<
    Record<number, { type: 'success' | 'error'; text: string }>
  >({});

  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState<string>('');
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string | null>(null);

  // Mobile compactness toggles
  const [showFullAbout, setShowFullAbout] = useState(false);
  const [showMobileFormats, setShowMobileFormats] = useState(false);
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);
  const [mobileGroupDay, setMobileGroupDay] = useState<'all' | 'sat' | 'sun'>('all');
  const [showAllMobileReviews, setShowAllMobileReviews] = useState(false);

  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [craftImgFailed, setCraftImgFailed] = useState(false);

  const loadSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/public/schedule');
      if (!res.ok) {
        throw new Error('Не удалось загрузить расписание мастерской');
      }
      const json = (await res.json()) as PublicScheduleResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки расписания');
    } finally {
      setLoading(false);
    }
  };

  const loadFamilySummary = async (token: string): Promise<ChildProfile[] | null> => {
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}`);
      if (res.status === 404) {
        onTokenInvalid?.();
        setFamilyChildren([]);
        setFamilyBookings([]);
        setFamilyWaitlist([]);
        return null;
      }
      if (!res.ok) {
        return null;
      }
      const json = (await res.json()) as {
        children?: ChildProfile[];
        bookings?: ParentBooking[];
        waitlist?: WaitlistEntry[];
      };
      const loadedChildren = json.children ?? [];
      setFamilyChildren(loadedChildren);
      setFamilyBookings(json.bookings ?? []);
      setFamilyWaitlist(json.waitlist ?? []);
      return loadedChildren;
    } catch (err) {
      console.warn('[PublicSchedulePage] Не удалось загрузить профиль семьи:', err);
      return null;
    }
  };

  useEffect(() => {
    void loadSchedule();
  }, []);

  useEffect(() => {
    if (savedFamilyToken) {
      void loadFamilySummary(savedFamilyToken);
    } else {
      setFamilyChildren([]);
      setFamilyBookings([]);
      setFamilyWaitlist([]);
    }
  }, [savedFamilyToken]);

  const calendarMonths = useMemo(
    () => getAvailableCalendarMonths(data?.lessons ?? []),
    [data?.lessons]
  );

  useEffect(() => {
    if (calendarMonths.length > 0 && !calendarMonths.includes(selectedCalendarMonth)) {
      setSelectedCalendarMonth(calendarMonths[0]);
    }
  }, [calendarMonths, selectedCalendarMonth]);

  const calendarCells = useMemo(() => {
    if (!selectedCalendarMonth) return [];
    return buildMonthCalendarCells(selectedCalendarMonth, data?.lessons ?? []);
  }, [selectedCalendarMonth, data?.lessons]);

  const slotGroups = useMemo(
    () => groupWeekendSlots(data?.lessons ?? []),
    [data?.lessons]
  );

  const nonGroupLessons = useMemo(
    () =>
      (data?.lessons ?? []).filter((lesson) => {
        if (filterType === 'all') return lesson.lesson_type !== 'group';
        if (filterType === 'group') return false;
        return lesson.lesson_type === filterType;
      }),
    [data?.lessons, filterType]
  );

  const openLegalDocByKey = (key: LegalDocKey) => {
    const doc = data?.legal_documents?.find((d) => d.doc_key === key);
    if (doc) {
      setPreviewLegalDoc(doc);
      return;
    }
    window.open(`/api/public/legal/${encodeURIComponent(key)}/file?inline=1`, '_blank', 'noopener');
  };

  const handleOpenFamilyLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    if (!linkInput.trim()) {
      setLinkError('Вставьте персональную ссылку или токен семьи');
      return;
    }

    setResolvingLink(true);
    try {
      const res = await fetch(
        `/api/public/resolve-link?input=${encodeURIComponent(linkInput.trim())}`
      );
      const body = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !body.token) {
        setLinkError(body.error || 'Ссылка не найдена или была отозвана мастером');
        return;
      }
      onTokenValid?.(body.token);
      if (pendingLesson) {
        const targetLesson = pendingLesson;
        setPendingLesson(null);
        const kids = await loadFamilySummary(body.token);
        if (kids && kids.length === 1) {
          await executeBookingForChild(targetLesson, kids[0].id, body.token);
          const scheduleEl = document.getElementById('schedule-section');
          scheduleEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
      onNavigate(`/lk/${body.token}`);
    } catch (err) {
      console.warn('[PublicSchedulePage] Ошибка проверки ссылки:', err);
      setLinkError('Ошибка проверки ссылки. Попробуйте снова.');
    } finally {
      setResolvingLink(false);
    }
  };

  const handleAddRegChild = () => {
    if (regChildren.length >= 10) return;
    setRegChildren((prev) => [...prev, { name: '', age: '10' }]);
  };

  const handleUpdateRegChild = (index: number, patch: Partial<{ name: string; age: string }>) => {
    setRegChildren((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveRegChild = (index: number) => {
    if (regChildren.length <= 1) return;
    setRegChildren((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSelfRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    setCreatedNotice(null);
    if (!regPersonalDataConsent) {
      setLinkError('Необходимо дать согласие на обработку персональных данных');
      return;
    }
    const cleanChildren = regChildren
      .map((c) => ({ name: c.name.trim(), age: Number(c.age) || 10 }))
      .filter((c) => c.name.length > 0);
    const parentTrimmed = regParentName.trim();
    const resolvedParent = parentTrimmed || cleanChildren[0]?.name || 'Новый ученик';
    const payloadChildren =
      cleanChildren.length > 0
        ? cleanChildren
        : [{ name: resolvedParent, age: Number(regChildren[0]?.age) || 10 }];

    setRegistering(true);
    try {
      const res = await fetch('/api/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_name: resolvedParent,
          children: payloadChildren,
          phone: regPhone.trim() || 'Не указан',
          email: regEmail.trim(),
          max_contact: regMax.trim(),
          personal_data_consent: true,
        }),
      });
      const body = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !body.token) {
        setLinkError(body.error || 'Не удалось создать личный кабинет ученика');
        return;
      }
      setCreatedToken(body.token);
      onTokenValid?.(body.token);

      const loadedKids = await loadFamilySummary(body.token);
      if (pendingLesson && loadedKids && loadedKids.length === 1) {
        const target = pendingLesson;
        setPendingLesson(null);
        await executeBookingForChild(target, loadedKids[0].id, body.token);
        setCreatedNotice(
          `Вы также автоматически записаны на «${target.title}» (${formatDateTimeRu(target.start_time)}).`
        );
      }
    } catch (err) {
      console.warn('[PublicSchedulePage] Ошибка регистрации ученика:', err);
      setLinkError('Ошибка сети при создании личного кабинета.');
    } finally {
      setRegistering(false);
    }
  };

  const handleCopyCreatedLink = async (tokenToCopy: string) => {
    const fullUrl = `${window.location.origin}/lk/${encodeURIComponent(tokenToCopy)}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedRegLink(true);
      setTimeout(() => setCopiedRegLink(false), 2500);
    } catch (err) {
      console.warn('[PublicSchedulePage] Не удалось скопировать ссылку:', err);
    }
  };

  const executeBookingForChild = async (
    lesson: PublicLesson,
    childId: number,
    tokenOverride?: string
  ) => {
    const activeToken = tokenOverride ?? savedFamilyToken;
    if (!activeToken) return;

    const isFull = lesson.free_spots === 0;
    setBusyLessonId(lesson.id);
    setPickingChildLessonId(null);

    try {
      const endpoint = isFull
        ? `/api/lk/${encodeURIComponent(activeToken)}/waitlist`
        : `/api/lk/${encodeURIComponent(activeToken)}/bookings`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson_id: lesson.id, child_id: childId }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBookingMessages((prev) => ({
          ...prev,
          [lesson.id]: {
            type: 'error',
            text: body.error || 'Не удалось выполнить запись',
          },
        }));
        return;
      }

      setBookingMessages((prev) => ({
        ...prev,
        [lesson.id]: {
          type: 'success',
          text: isFull
            ? `Вы записаны в лист ожидания (${formatShortDateRu(lesson.start_time)})!`
            : `Вы записаны на ${formatDateTimeRu(lesson.start_time)}!`,
        },
      }));
      await Promise.all([loadSchedule(), loadFamilySummary(activeToken)]);
    } catch (err) {
      console.warn('[PublicSchedulePage] Ошибка записи на занятие:', err);
      setBookingMessages((prev) => ({
        ...prev,
        [lesson.id]: {
          type: 'error',
          text: 'Ошибка соединения. Попробуйте ещё раз.',
        },
      }));
    } finally {
      setBusyLessonId(null);
    }
  };

  const scrollToCabinetAuth = (lesson?: PublicLesson) => {
    if (lesson) {
      setPendingLesson(lesson);
    }
    setCabinetMode('login');
    setLinkError(null);
    const inputEl = document.getElementById('cabinet-access-section');
    inputEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleBookFromSchedule = async (lesson?: PublicLesson) => {
    if (!lesson) {
      if (savedFamilyToken) {
        onNavigate(`/lk/${savedFamilyToken}`);
      } else {
        scrollToCabinetAuth();
      }
      return;
    }

    if (!savedFamilyToken) {
      scrollToCabinetAuth(lesson);
      return;
    }

    let kids = familyChildren;
    if (kids.length === 0) {
      const loaded = await loadFamilySummary(savedFamilyToken);
      if (!loaded || loaded.length === 0) {
        scrollToCabinetAuth(lesson);
        return;
      }
      kids = loaded;
    }

    const activeBookedChildIds = new Set(
      familyBookings
        .filter((b) => b.lesson_id === lesson.id && b.status !== 'canceled')
        .map((b) => b.child_id)
    );
    const activeWaitlistChildIds = new Set(
      familyWaitlist
        .filter((w) => w.lesson_id === lesson.id)
        .map((w) => w.child_id)
    );

    const availableKids = kids.filter(
      (c) => !activeBookedChildIds.has(c.id) && !activeWaitlistChildIds.has(c.id)
    );

    if (availableKids.length === 0) {
      setBookingMessages((prev) => ({
        ...prev,
        [lesson.id]: {
          type: 'success',
          text: 'Вы уже записаны на это занятие.',
        },
      }));
      return;
    }

    if (availableKids.length === 1) {
      await executeBookingForChild(lesson, availableKids[0].id);
      return;
    }

    setPickingChildLessonId((prev) => (prev === lesson.id ? null : lesson.id));
  };

  const getLessonStatusForFamily = (lesson: PublicLesson) => {
    const lessonBookings = familyBookings.filter(
      (b) => b.lesson_id === lesson.id && b.status !== 'canceled'
    );
    const lessonWaitlist = familyWaitlist.filter((w) => w.lesson_id === lesson.id);
    const isAlreadyBooked =
      familyChildren.length > 0 &&
      lessonBookings.length >= familyChildren.length;
    const isAlreadyWaitlisted =
      familyChildren.length > 0 &&
      lessonWaitlist.length > 0 &&
      lessonBookings.length + lessonWaitlist.length >= familyChildren.length;
    return { lessonBookings, lessonWaitlist, isAlreadyBooked, isAlreadyWaitlisted };
  };

  const selectedCalendarCell = useMemo(() => {
    if (!selectedCalendarDateKey) return null;
    return calendarCells.find((c) => c.dateKey === selectedCalendarDateKey) ?? null;
  }, [calendarCells, selectedCalendarDateKey]);

  const monthIdx = calendarMonths.indexOf(selectedCalendarMonth);

  return (
    <div className="mx-auto w-full max-w-6xl overflow-x-clip px-3 py-4 sm:px-6 sm:py-10">
      {/* Hero Split */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-1 items-stretch gap-4 sm:gap-6 lg:grid-cols-12"
      >
        <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_10px_28px_-16px_rgba(17,24,39,0.08)] sm:p-8 lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[#6B7280] sm:gap-2 sm:text-xs">
              <MapPin className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
              <span>г. Сургут, ул. 30 лет Победы, 21/3</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">Руководитель Денис Авимский</span>
            </div>

            <h1 className="mt-2.5 font-display text-2xl font-bold tracking-tight text-[#111827] sm:mt-4 sm:text-4xl [text-wrap:balance]">
              Ясна — школа труда и столярная мастерская в Сургуте ☀️
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6B7280] sm:mt-3 sm:text-[15px]">
              Здесь взрослые и дети от 6 лет учатся работать руками: пилить, шлифовать, собирать
              изделия из дерева и доводить дело до результата.
            </p>

            <p className="mt-2.5 hidden max-w-2xl text-sm font-medium text-[#374151] sm:block">
              Группы, индивидуальные занятия, семейные мастер-классы, дни рождения и
              мастер-классы для компаний.
            </p>

            {/* Concrete configurable fact grid */}
            {(() => {
              const s = data?.settings;
              const factCards: Array<{ label: string; value: string }> = [];
              if ((s?.show_hero_age ?? 1) === 1) {
                factCards.push({
                  label: 'Возраст',
                  value: s?.hero_age_text || 'От 6 лет',
                });
              }
              if ((s?.show_hero_duration ?? 1) === 1) {
                factCards.push({
                  label: 'Длительность',
                  value: s?.hero_duration_text || '2 часа',
                });
              }
              if ((s?.show_hero_groups ?? 1) === 1) {
                factCards.push({
                  label: 'Группы',
                  value: s?.hero_groups_text || 'до 4 мест',
                });
              }
              if ((s?.show_hero_free_cancel ?? 0) === 1) {
                factCards.push({
                  label: 'Отмена без списания',
                  value: `за ${s?.free_cancel_hours ?? 24} ч`,
                });
              }
              if (factCards.length === 0) return null;
              const colsClass =
                factCards.length === 1
                  ? 'grid-cols-1 sm:max-w-xs'
                  : factCards.length === 2
                    ? 'grid-cols-2'
                    : factCards.length === 3
                      ? 'grid-cols-2 sm:grid-cols-3'
                      : 'grid-cols-2 sm:grid-cols-4';
              return (
                <div className={`mt-4 grid gap-2 sm:mt-6 sm:gap-3 ${colsClass}`}>
                  {factCards.map((card, idx) => (
                    <div
                      key={card.label}
                      className={`rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 sm:px-3.5 sm:py-3 ${
                        factCards.length === 3 && idx === 2 ? 'col-span-2 sm:col-span-1' : ''
                      }`}
                    >
                      <div className="text-xs text-[#6B7280]">{card.label}</div>
                      <div className="mt-0.5 text-sm font-semibold text-[#111827] tabular-nums sm:mt-1 sm:text-base">
                        {card.value}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Student / Parent Personal Link & Self-Registration Box */}
          <div id="cabinet-access-section" className="mt-4 border-t border-[#E5E7EB] pt-4 sm:mt-7 sm:pt-6">
            {pendingLesson && !savedFamilyToken && (
              <div className="mb-3 rounded-xl border border-[#F59E0B]/40 bg-[#FFFBEB] px-3.5 py-2.5 text-xs text-[#92400E]">
                Чтобы записаться на занятие «<strong>{pendingLesson.title}</strong>» (
                {formatDateTimeRu(pendingLesson.start_time)}), войдите по своей ссылке или
                зарегистрируйтесь ниже.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setCabinetMode('login');
                    setLinkError(null);
                  }}
                  className={`min-h-[36px] cursor-pointer rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                    cabinetMode === 'login'
                      ? 'bg-[#C86D2D] text-white shadow-xs'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  Вход по ссылке
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCabinetMode('register');
                    setLinkError(null);
                  }}
                  className={`min-h-[36px] cursor-pointer rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                    cabinetMode === 'register'
                      ? 'bg-[#C86D2D] text-white shadow-xs'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  Регистрация ученика
                </button>
              </div>

              {savedFamilyToken && (
                <button
                  type="button"
                  onClick={() => onNavigate(`/lk/${savedFamilyToken}`)}
                  className="cursor-pointer whitespace-nowrap text-xs font-semibold text-[#C86D2D] hover:text-[#B05B20]"
                >
                  Вернуться в открытый кабинет →
                </button>
              )}
            </div>

            {cabinetMode === 'login' ? (
              <div className="mt-3">
                <label
                  htmlFor="family-link-input"
                  className="flex items-center gap-2 text-xs font-medium text-[#6B7280]"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                  Уже есть персональная ссылка? Вставьте её или код доступа:
                </label>
                <form
                  onSubmit={handleOpenFamilyLink}
                  className="mt-2 flex flex-col gap-2.5 sm:flex-row"
                >
                  <input
                    id="family-link-input"
                    type="text"
                    value={linkInput}
                    onChange={(e) => {
                      setLinkInput(e.target.value);
                      setLinkError(null);
                    }}
                    placeholder="Вставьте ссылку /lk/... или код доступа"
                    className="min-h-[44px] flex-1 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 text-sm text-[#111827] placeholder-[#9CA3AF] transition-colors focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={resolvingLink}
                    className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#C86D2D] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#B05B20] active:scale-[0.98] disabled:opacity-60"
                  >
                    {resolvingLink ? 'Проверка...' : 'Открыть кабинет'}
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </form>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280]">
                  <span>Впервые в мастерской «Ясна»?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCabinetMode('register');
                      setLinkError(null);
                    }}
                    className="cursor-pointer font-semibold text-[#C86D2D] hover:underline"
                  >
                    Зарегистрироваться и получить ссылку для входа →
                  </button>
                </div>
              </div>
            ) : createdToken ? (
              <div className="mt-3 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-4">
                <div className="text-sm font-semibold text-[#065F46]">
                  Личный кабинет создан! Ваша персональная ссылка для входа:
                </div>
                {createdNotice && (
                  <div className="mt-1.5 text-xs font-medium text-[#065F46]">
                    {createdNotice}
                  </div>
                )}
                <div className="mt-2.5 flex min-w-0 flex-col gap-2">
                  <div className="min-w-0 break-all rounded-lg border border-[#A7F3D0] bg-white px-3 py-2 font-mono text-xs text-[#111827]">
                    {`${window.location.origin}/lk/${createdToken}`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyCreatedLink(createdToken)}
                      className="min-h-[40px] cursor-pointer rounded-lg border border-[#065F46] bg-white px-3.5 text-xs font-semibold text-[#065F46] hover:bg-[#F0FDF4]"
                    >
                      {copiedRegLink ? 'Скопировано!' : 'Скопировать ссылку'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate(`/lk/${createdToken}`)}
                      className="inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#C86D2D] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#B05B20]"
                    >
                      <span>Войти в личный кабинет</span>
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[#065F46]">
                  Сохраните эту ссылку — по ней вы всегда сможете войти в свой личный кабинет и
                  отредактировать анкету.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSelfRegister} className="mt-3 space-y-3.5">
                <p className="text-xs text-[#6B7280]">
                  Укажите данные ребёнка (можно добавить нескольких детей) и контакты родителя:
                </p>

                {/* Children block FIRST */}
                <div className="space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#111827]">Ученики (дети)</span>
                    {regChildren.length < 10 && (
                      <button
                        type="button"
                        onClick={handleAddRegChild}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#C86D2D] hover:text-[#B05B20]"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        Добавить ребёнка
                      </button>
                    )}
                  </div>

                  {regChildren.map((child, idx) => (
                    <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        value={child.name}
                        onChange={(e) => handleUpdateRegChild(idx, { name: e.target.value })}
                        placeholder={
                          regChildren.length > 1
                            ? `Имя и фамилия ребёнка ${idx + 1}`
                            : 'Имя и фамилия ребёнка *'
                        }
                        className="min-h-[42px] flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#C86D2D] focus:outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={3}
                          max={99}
                          value={child.age}
                          onChange={(e) => handleUpdateRegChild(idx, { age: e.target.value })}
                          placeholder="Возраст"
                          title="Возраст ребёнка"
                          className="min-h-[42px] w-24 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] tabular-nums focus:border-[#C86D2D] focus:outline-none"
                        />
                        <span className="text-xs text-[#6B7280]">лет</span>
                        {regChildren.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRegChild(idx)}
                            aria-label="Удалить ребёнка"
                            className="inline-flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-[#FECACA] bg-white text-[#991B1B] hover:bg-[#FEF2F2]"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Parent contacts BELOW */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input
                    type="text"
                    value={regParentName}
                    onChange={(e) => setRegParentName(e.target.value)}
                    placeholder="Имя и фамилия родителя *"
                    className="min-h-[42px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                  />
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Номер телефона (+7 ...)"
                    className="min-h-[42px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                  />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="Почта (Email)"
                    className="min-h-[42px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                  />
                  <input
                    type="text"
                    value={regMax}
                    onChange={(e) => setRegMax(e.target.value)}
                    placeholder="Мессенджер MAX (ник / телефон)"
                    className="min-h-[42px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-2.5 text-xs text-[#374151] transition-colors hover:border-[#C86D2D]/50">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      required
                      checked={regPersonalDataConsent}
                      onChange={(e) => {
                        setRegPersonalDataConsent(e.target.checked);
                        if (e.target.checked) {
                          setLinkError(null);
                        }
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[#D1D5DB] text-[#C86D2D] focus:ring-[#C86D2D]"
                    />
                    <span className="leading-relaxed">
                      Я даю согласие с документом{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openLegalDocByKey('personal_data');
                        }}
                        className="cursor-pointer font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                      >
                        «Согласие на обработку персональных данных»
                      </button>
                      , ознакомлен(а) с{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openLegalDocByKey('privacy');
                        }}
                        className="cursor-pointer font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                      >
                        «Политика конфиденциальности»
                      </button>{' '}
                      и{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openLegalDocByKey('offer');
                        }}
                        className="cursor-pointer font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                      >
                        «Публичная оферта»
                      </button>
                      .
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="submit"
                    disabled={registering || !regPersonalDataConsent}
                    className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C86D2D] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#B05B20] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>
                      {registering
                        ? 'Создание кабинета...'
                        : 'Получить ссылку для входа и открыть ЛК'}
                    </span>
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </form>
            )}

            {linkError && (
              <p className="mt-2 text-xs font-medium text-[#991B1B]" role="alert">
                {linkError}
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Editorial Workshop Photography (compact banner on mobile) */}
        <div className="relative h-40 min-w-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_10px_28px_-16px_rgba(17,24,39,0.12)] sm:h-auto sm:min-h-[260px] lg:col-span-5">
          {!heroImgFailed ? (
            <img
              src={workshopHeroImg}
              alt="Верстак и столярные инструменты в школе труда Ясна"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center bg-gradient-to-br from-[#F9F4EE] to-[#EDE5DA] p-5 text-center sm:min-h-[280px] sm:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FDF4ED] text-[#C86D2D] shadow-sm sm:h-14 sm:w-14">
                <Hammer className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} />
              </div>
              <div className="mt-2 font-display text-base font-semibold text-[#111827] sm:mt-3 sm:text-lg">
                Школа труда «Ясна»
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3.5 sm:p-5">
            <div className="text-[11px] font-medium text-white/85 sm:text-xs">
              Живая практика с первого урока
            </div>
            <div className="mt-0.5 text-xs font-semibold text-white sm:text-sm">
              Учимся работать руками и доводить задуманное до результата
            </div>
          </div>
        </div>
      </motion.section>

      {/* About Workshop Philosophy Block (collapsible on mobile) */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, delay: 0.03, ease: [0.16, 1, 0.3, 1] }}
        className="mt-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mt-8 sm:p-8"
      >
        <div className="grid grid-cols-1 gap-3 sm:gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#C86D2D] sm:text-xs">
              О мастерской
            </div>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#111827] sm:mt-1.5 sm:text-2xl">
              «Ясна» — это не потоковый кружок, а школа труда
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#6B7280] sm:mt-3 sm:text-sm">
              Мы верим, что труд — это не что-то скучное и формальное, а живой и интересный
              процесс, через который человек учится понимать мир и свои возможности.
            </p>
            <button
              type="button"
              onClick={() => setShowFullAbout((prev) => !prev)}
              className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#C86D2D] sm:hidden"
            >
              <span>{showFullAbout ? 'Свернуть описание' : 'Читать полностью'}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showFullAbout ? 'rotate-180' : ''}`}
                strokeWidth={1.75}
              />
            </button>
          </div>
          <div
            className={`${
              showFullAbout ? 'block' : 'hidden'
            } space-y-2.5 text-xs leading-relaxed text-[#374151] sm:block sm:space-y-3 sm:text-sm lg:col-span-7`}
          >
            <p>
              В мастерской проходят групповые занятия для детей 6+. Здесь ребята знакомятся с
              инструментами, учатся работать с деревом, доводить начатое до результата и видеть
              ценность своего труда.
            </p>
            <p>
              Помимо групп у нас проходят индивидуальные занятия, семейные мастер-классы, дни
              рождения и мастер-классы для компаний.
            </p>
            <p className="font-medium text-[#111827]">
              «Ясна» — это пространство, где можно работать руками, ошибаться, пробовать и видеть
              реальный результат своей работы. Сюда приходят за навыком, за опытом, за ощущением
              «я сделал это сам» — и часто возвращаются снова.
            </p>
          </div>
        </div>
      </motion.section>

      {/* Formats & Tariffs Section */}
      <motion.section
        id="formats-section"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-5 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-12"
      >
        <div className="hidden overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:block lg:col-span-4">
          <div className="aspect-[4/3] w-full overflow-hidden bg-[#F5F6F8]">
            {!craftImgFailed ? (
              <img
                src={craftFormatsImg}
                alt="Готовые изделия из дерева: скворечник, подставка и подсвечник"
                referrerPolicy="no-referrer"
                onError={() => setCraftImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#F9F4EE]">
                <Sparkles className="h-10 w-10 text-[#C86D2D]" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <div className="p-5">
            <h2 className="font-display text-lg font-semibold text-[#111827]">
              Форматы занятий и стоимость
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7280]">
              Все материалы, заготовки, крепёж и средства защиты уже включены в стоимость
              разового занятия и абонементов.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 sm:gap-4 lg:col-span-8">
          {/* Mobile compact toggle for formats */}
          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setShowMobileFormats((prev) => !prev)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div>
                <div className="text-xs font-semibold text-[#111827]">
                  Форматы: группы, МК, дни рождения
                </div>
                <div className="text-[11px] text-[#6B7280]">
                  Все материалы и защита включены в стоимость
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#C86D2D] transition-transform ${
                  showMobileFormats ? 'rotate-180' : ''
                }`}
                strokeWidth={1.75}
              />
            </button>
          </div>

          <div
            className={`${
              showMobileFormats ? 'grid' : 'hidden'
            } grid-cols-1 gap-3 sm:grid sm:grid-cols-3 sm:gap-4`}
          >
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FDF4ED] text-[#C86D2D] sm:h-9 sm:w-9">
                <Users className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h3 className="mt-2.5 font-display text-sm font-semibold text-[#111827] sm:mt-3 sm:text-base">
                Группы и индивидуально
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#6B7280] sm:mt-1.5">
                Взрослые и дети от 6 лет. Группы по субботам и воскресеньям в 10:00, 13:00 и
                16:00 (2 часа) или индивидуально 1 на 1.
              </p>
            </motion.div>

            <motion.div
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FDF4ED] text-[#C86D2D] sm:h-9 sm:w-9">
                <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h3 className="mt-2.5 font-display text-sm font-semibold text-[#111827] sm:mt-3 sm:text-base">
                Семейные МК и дни рождения
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#6B7280] sm:mt-1.5">
                Совместное творчество родителей и детей, а также праздники в мастерской, где
                каждый гость делает своё изделие.
              </p>
            </motion.div>

            <motion.div
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FDF4ED] text-[#C86D2D] sm:h-9 sm:w-9">
                <User className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h3 className="mt-2.5 font-display text-sm font-semibold text-[#111827] sm:mt-3 sm:text-base">
                Мастер-классы для компаний
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#6B7280] sm:mt-1.5">
                Командные столярные встречи и тимбилдинги: живая работа руками и готовый
                результат для каждого участника.
              </p>
            </motion.div>
          </div>

          {/* Tariffs Strip */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
              <h3 className="font-display text-sm font-semibold text-[#111827]">
                Тарифы
              </h3>
              <span className="text-[11px] text-[#6B7280] sm:text-xs">
                Срок абонемента согласовывается с мастером
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
              {(data?.tariffs ?? []).map((tariff) => (
                <div
                  key={tariff.id}
                  className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-2.5 sm:flex-col sm:items-start sm:gap-1 sm:px-4 sm:py-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#111827]">{tariff.title}</div>
                    <div className="text-xs text-[#6B7280] tabular-nums">
                      {pluralizeLessons(tariff.lessons_count)}
                    </div>
                  </div>
                  <div className="font-display text-base font-bold text-[#111827] tabular-nums sm:mt-1">
                    {formatMoney(tariff.price)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Schedule Section */}
      <section id="schedule-section" className="mt-6 sm:mt-10">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-[#111827] sm:text-2xl">
              Групповые занятия и расписание
            </h2>
            <p className="mt-1 text-xs text-[#6B7280] sm:text-sm">
              Выходные в 10:00, 13:00 и 16:00 (2 часа) — запишитесь на ближайшее или выберите дату.
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1 rounded-xl border border-[#E5E7EB] bg-white p-1">
            {(
              [
                { id: 'all', label: 'Все' },
                { id: 'group', label: 'Группы' },
                { id: 'masterclass', label: 'Мастер-классы' },
                { id: 'individual', label: 'Индивидуальные' },
                { id: 'birthday', label: 'Дни рождения' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`min-h-[36px] cursor-pointer whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors sm:min-h-[40px] sm:px-3.5 sm:text-sm ${
                  filterType === tab.id
                    ? 'bg-[#C86D2D] text-white shadow-sm'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((skeleton) => (
              <div
                key={skeleton}
                className="h-44 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white p-5"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-sm text-[#991B1B]">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadSchedule()}
              className="mt-3 min-h-[44px] cursor-pointer rounded-xl bg-white px-4 py-2 font-medium text-[#111827] shadow-sm"
            >
              Повторить загрузку
            </button>
          </div>
        )}

        {/* 6 Recurring Group Slots */}
        {!loading && !error && (filterType === 'all' || filterType === 'group') && (
          <div className="mt-4 sm:mt-5">
            {slotGroups.length === 0 ? (
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 text-center sm:p-8">
                <Calendar className="mx-auto h-7 w-7 text-[#6B7280]" strokeWidth={1.5} />
                <div className="mt-2 font-display text-base font-semibold text-[#111827]">
                  Предстоящих групповых занятий пока нет
                </div>
                <p className="mt-1 text-sm text-[#6B7280]">
                  Скоро мастер добавит новые даты в расписание.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile quick weekday filter (Все / Суббота / Воскресенье) */}
                <div className="mb-3 flex gap-1.5 sm:hidden">
                  {(
                    [
                      { id: 'all', label: `Все (${slotGroups.length})` },
                      { id: 'sat', label: 'Суббота' },
                      { id: 'sun', label: 'Воскресенье' },
                    ] as const
                  ).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setMobileGroupDay(d.id)}
                      className={`min-h-[36px] flex-1 cursor-pointer rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
                        mobileGroupDay === d.id
                          ? 'border-[#C86D2D] bg-[#FDF4ED] text-[#C86D2D]'
                          : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {slotGroups
                    .filter((g) => {
                      if (mobileGroupDay === 'sat') return g.dow === 6;
                      if (mobileGroupDay === 'sun') return g.dow === 0;
                      return true;
                    })
                    .map((group) => {
                      const targetLesson = group.nearestOpen ?? group.nearestLesson;
                      const {
                        lessonBookings,
                        lessonWaitlist,
                        isAlreadyBooked,
                        isAlreadyWaitlisted,
                      } = getLessonStatusForFamily(targetLesson);
                      const isBusy = busyLessonId === targetLesson.id;
                      const isPickingChild = pickingChildLessonId === targetLesson.id;
                      const isExpanded = expandedGroupKey === group.key;
                      const targetFull = targetLesson.free_spots === 0;
                      const msg = bookingMessages[targetLesson.id];

                      return (
                        <article
                          key={group.key}
                          id={`schedule-lesson-${targetLesson.id}`}
                          className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs font-medium text-[#C86D2D]">
                                  Групповое занятие · {group.durationMinutes} мин · {formatMoney(group.singlePrice)}
                                </div>
                                <h3 className="mt-0.5 font-display text-base font-bold text-[#111827] sm:mt-1 sm:text-lg">
                                  {group.weekdayLabel} · {group.timeRange}
                                </h3>
                              </div>
                              <span
                                className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums sm:px-2.5 sm:py-1 ${
                                  targetFull
                                    ? 'bg-[#FEF2F2] text-[#991B1B]'
                                    : targetLesson.free_spots === 1
                                      ? 'bg-[#FFFBEB] text-[#92400E]'
                                      : 'bg-[#ECFDF5] text-[#065F46]'
                                }`}
                              >
                                {targetFull
                                  ? 'Мест нет'
                                  : `${targetLesson.free_spots} из ${targetLesson.capacity} мест`}
                              </span>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-xs sm:mt-3 sm:py-2.5">
                              <span className="text-[#6B7280]">Ближайшее:</span>
                              <span className="font-semibold text-[#111827] tabular-nums">
                                {formatLongDateRu(targetLesson.start_time)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-2.5">
                            <div className="flex flex-wrap gap-2">
                              {isAlreadyBooked && familyChildren.length <= 1 ? (
                                <span className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-[#ECFDF5] px-3 text-xs font-semibold text-[#065F46] sm:min-h-[44px]">
                                  Вы записаны ({formatShortDateRu(targetLesson.start_time)}) ✓
                                </span>
                              ) : isAlreadyWaitlisted && familyChildren.length <= 1 ? (
                                <span className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-[#FFFBEB] px-3 text-xs font-semibold text-[#92400E] sm:min-h-[44px]">
                                  В листе ожидания ✓
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleBookFromSchedule(targetLesson)}
                                  className={`min-h-[40px] flex-1 cursor-pointer rounded-xl px-3 text-xs font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-60 sm:min-h-[44px] sm:px-3.5 ${
                                    targetFull
                                      ? 'border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] hover:bg-[#F3F4F6]'
                                      : 'bg-[#C86D2D] text-white shadow-sm hover:bg-[#B05B20]'
                                  }`}
                                >
                                  {isBusy
                                    ? 'Записываем...'
                                    : targetFull
                                      ? 'Лист ожидания'
                                      : 'Записаться на ближайшее'}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedGroupKey((prev) =>
                                    prev === group.key ? null : group.key
                                  )
                                }
                                className="inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#111827] hover:bg-[#F9FAFB] sm:min-h-[44px]"
                              >
                                <span>Выбрать дату ({group.dates.length})</span>
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                  strokeWidth={1.75}
                                />
                              </button>
                            </div>

                        {isPickingChild && familyChildren.length > 1 && (
                          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-2.5">
                            <span className="text-xs font-medium text-[#6B7280]">
                              Кого записать:
                            </span>
                            {familyChildren.map((child) => {
                              const childBooked = lessonBookings.some(
                                (b) => b.child_id === child.id
                              );
                              const childWaiting = lessonWaitlist.some(
                                (w) => w.child_id === child.id
                              );
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  disabled={childBooked || childWaiting || isBusy}
                                  onClick={() =>
                                    void executeBookingForChild(targetLesson, child.id)
                                  }
                                  className={`min-h-[34px] cursor-pointer rounded-lg px-3 text-xs font-semibold ${
                                    childBooked || childWaiting
                                      ? 'border border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                                      : 'bg-[#C86D2D] text-white hover:bg-[#B05B20]'
                                  }`}
                                >
                                  {child.name}
                                  {childBooked
                                    ? ' (Записан)'
                                    : childWaiting
                                      ? ' (Ожидание)'
                                      : ''}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {msg && (
                          <div
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                              msg.type === 'success'
                                ? 'border border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                                : 'border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                            }`}
                          >
                            <span>{msg.text}</span>
                            {savedFamilyToken && msg.type === 'success' && (
                              <button
                                type="button"
                                onClick={() => onNavigate(`/lk/${savedFamilyToken}`)}
                                className="cursor-pointer font-semibold underline underline-offset-2"
                              >
                                Открыть ЛК →
                              </button>
                            )}
                          </div>
                        )}

                        {/* Expandable inline dates list */}
                        {isExpanded && (
                          <div className="space-y-1.5 border-t border-[#F3F4F6] pt-2.5">
                            <div className="text-[11px] font-medium text-[#6B7280]">
                              Доступные даты группы ({group.weekdayLabel}, {group.startTime}):
                            </div>
                            {group.dates.map((dateLesson) => {
                              const dStatus = getLessonStatusForFamily(dateLesson);
                              const dFull = dateLesson.free_spots === 0;
                              const dBusy = busyLessonId === dateLesson.id;
                              const dPicking = pickingChildLessonId === dateLesson.id;
                              const dMsg = bookingMessages[dateLesson.id];

                              return (
                                <div
                                  key={dateLesson.id}
                                  className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-[#111827] tabular-nums">
                                        {formatLongDateRu(dateLesson.start_time)}
                                      </div>
                                      <div className="text-[11px] text-[#6B7280] tabular-nums">
                                        {dFull
                                          ? 'Мест нет (лист ожидания)'
                                          : `Свободно ${dateLesson.free_spots} из ${dateLesson.capacity}`}
                                      </div>
                                    </div>

                                    {dStatus.isAlreadyBooked && familyChildren.length <= 1 ? (
                                      <span className="rounded-lg bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#065F46]">
                                        Записан ✓
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={dBusy}
                                        onClick={() => void handleBookFromSchedule(dateLesson)}
                                        className={`min-h-[34px] shrink-0 cursor-pointer rounded-lg px-2.5 text-xs font-semibold ${
                                          dFull
                                            ? 'border border-[#E5E7EB] bg-white text-[#111827]'
                                            : 'bg-[#C86D2D] text-white hover:bg-[#B05B20]'
                                        }`}
                                      >
                                        {dBusy
                                          ? '...'
                                          : dFull
                                            ? 'Ожидание'
                                            : 'Записаться'}
                                      </button>
                                    )}
                                  </div>

                                  {dPicking && familyChildren.length > 1 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#E5E7EB] pt-2">
                                      {familyChildren.map((child) => {
                                        const cBooked = dStatus.lessonBookings.some(
                                          (b) => b.child_id === child.id
                                        );
                                        return (
                                          <button
                                            key={child.id}
                                            type="button"
                                            disabled={cBooked || dBusy}
                                            onClick={() =>
                                              void executeBookingForChild(dateLesson, child.id)
                                            }
                                            className={`min-h-[30px] cursor-pointer rounded-md px-2.5 text-[11px] font-semibold ${
                                              cBooked
                                                ? 'bg-[#ECFDF5] text-[#065F46]'
                                                : 'bg-[#C86D2D] text-white'
                                            }`}
                                          >
                                            {child.name}
                                            {cBooked ? ' ✓' : ''}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {dMsg && (
                                    <div
                                      className={`mt-1.5 text-[11px] font-medium ${
                                        dMsg.type === 'success'
                                          ? 'text-[#065F46]'
                                          : 'text-[#991B1B]'
                                      }`}
                                    >
                                      {dMsg.text}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </article>
                      );
                    })}
                </div>
              </>
            )}

            {/* Legal acknowledgment note directly under group booking */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-[#6B7280]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#C86D2D]" strokeWidth={1.75} />
              <span>Записываясь на занятие, вы подтверждаете ознакомление с документами:</span>
              <button
                type="button"
                onClick={() => openLegalDocByKey('offer')}
                className="cursor-pointer font-medium text-[#111827] underline decoration-[#D1D5DB] underline-offset-2 hover:text-[#C86D2D]"
              >
                Публичная оферта
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => openLegalDocByKey('privacy')}
                className="cursor-pointer font-medium text-[#111827] underline decoration-[#D1D5DB] underline-offset-2 hover:text-[#C86D2D]"
              >
                Политика конфиденциальности
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => openLegalDocByKey('personal_data')}
                className="cursor-pointer font-medium text-[#111827] underline decoration-[#D1D5DB] underline-offset-2 hover:text-[#C86D2D]"
              >
                Согласие на обработку ПД
              </button>
            </div>
          </div>
        )}

        {/* Non-group lessons (Мастер-классы, Индивидуальные, Дни рождения) */}
        {!loading &&
          !error &&
          (filterType !== 'group' && nonGroupLessons.length > 0 ? (
            <div className="mt-8">
              {filterType === 'all' && (
                <h3 className="mb-3 font-display text-lg font-bold text-[#111827]">
                  Мастер-классы и другие форматы
                </h3>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {nonGroupLessons.map((lesson, index) => {
                  const isFull = lesson.free_spots === 0;
                  const isAlmostFull = lesson.free_spots === 1;
                  const isBusy = busyLessonId === lesson.id;
                  const isPickingChild = pickingChildLessonId === lesson.id;
                  const msg = bookingMessages[lesson.id];
                  const {
                    lessonBookings,
                    lessonWaitlist,
                    isAlreadyBooked,
                    isAlreadyWaitlisted,
                  } = getLessonStatusForFamily(lesson);

                  const spotBadgeClass = isFull
                    ? 'bg-[#FEF2F2] text-[#991B1B]'
                    : isAlmostFull
                      ? 'bg-[#FFFBEB] text-[#92400E]'
                      : 'bg-[#ECFDF5] text-[#065F46]';

                  return (
                    <motion.article
                      key={lesson.id}
                      id={`schedule-lesson-${lesson.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        delay: Math.min(index * 0.04, 0.2),
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                            <span>{lessonTypeLabel(lesson.lesson_type)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
                              {lesson.duration_minutes} мин
                            </span>
                          </div>

                          <span
                            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums ${spotBadgeClass}`}
                          >
                            {isFull
                              ? 'Мест нет'
                              : `Осталось мест: ${lesson.free_spots} из ${lesson.capacity}`}
                          </span>
                        </div>

                        <h3 className="mt-3 font-display text-lg font-semibold text-[#111827]">
                          {lesson.title}
                        </h3>

                        {lesson.description && (
                          <p className="mt-1.5 text-sm leading-relaxed text-[#6B7280]">
                            {lesson.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-5 border-t border-[#F3F4F6] pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#111827] tabular-nums">
                              {formatDateTimeRu(lesson.start_time)}
                            </div>
                            <div className="text-xs text-[#6B7280] tabular-nums">
                              Стоимость: {formatMoney(lesson.single_price)}
                            </div>
                          </div>

                          {isAlreadyBooked && familyChildren.length <= 1 ? (
                            <span className="inline-flex min-h-[44px] items-center rounded-xl bg-[#ECFDF5] px-4 py-2 text-sm font-semibold text-[#065F46]">
                              Вы записаны ✓
                            </span>
                          ) : isAlreadyWaitlisted && familyChildren.length <= 1 ? (
                            <span className="inline-flex min-h-[44px] items-center rounded-xl bg-[#FFFBEB] px-4 py-2 text-sm font-semibold text-[#92400E]">
                              В листе ожидания ✓
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleBookFromSchedule(lesson)}
                              className={`min-h-[44px] cursor-pointer whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-60 ${
                                isFull
                                  ? 'border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] hover:bg-[#F3F4F6]'
                                  : 'bg-[#C86D2D] text-white shadow-sm hover:bg-[#B05B20]'
                              }`}
                            >
                              {isBusy
                                ? 'Записываем...'
                                : isFull
                                  ? 'Лист ожидания'
                                  : 'Записаться'}
                            </button>
                          )}
                        </div>

                        {isPickingChild && familyChildren.length > 1 && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-2.5">
                            <span className="text-xs font-medium text-[#6B7280]">
                              Кого записать:
                            </span>
                            {familyChildren.map((child) => {
                              const childBooked = lessonBookings.some(
                                (b) => b.child_id === child.id
                              );
                              const childWaiting = lessonWaitlist.some(
                                (w) => w.child_id === child.id
                              );
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  disabled={childBooked || childWaiting || isBusy}
                                  onClick={() => void executeBookingForChild(lesson, child.id)}
                                  className={`min-h-[34px] cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors ${
                                    childBooked || childWaiting
                                      ? 'border border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                                      : 'bg-[#C86D2D] text-white hover:bg-[#B05B20]'
                                  }`}
                                >
                                  {child.name}
                                  {childBooked
                                    ? ' (Записан)'
                                    : childWaiting
                                      ? ' (В ожидании)'
                                      : ''}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {msg && (
                          <div
                            className={`mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                              msg.type === 'success'
                                ? 'border border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                                : 'border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                            }`}
                          >
                            <span>{msg.text}</span>
                            {savedFamilyToken && msg.type === 'success' && (
                              <button
                                type="button"
                                onClick={() => onNavigate(`/lk/${savedFamilyToken}`)}
                                className="cursor-pointer font-semibold underline underline-offset-2"
                              >
                                Открыть кабинет →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </div>
          ) : filterType !== 'all' && filterType !== 'group' && nonGroupLessons.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center">
              <Calendar className="mx-auto h-7 w-7 text-[#6B7280]" strokeWidth={1.5} />
              <div className="mt-2 font-display text-base font-semibold text-[#111827]">
                В этом разделе пока нет открытых занятий
              </div>
              <p className="mt-1 text-sm text-[#6B7280]">
                Переключите фильтр на «Группы» или уточните у мастера удобное время.
              </p>
            </div>
          ) : null)}

        {/* Compact Monthly Calendar (collapsible on mobile, always expanded on sm+) */}
        {!loading && !error && calendarCells.length > 0 && (
          <div className="mt-5 sm:mt-8">
            <button
              type="button"
              onClick={() => setShowMobileCalendar((prev) => !prev)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:hidden"
            >
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.75} />
                <span className="text-xs font-bold text-[#111827]">
                  Календарь — {formatYearMonthRu(selectedCalendarMonth)}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#C86D2D]">
                <span>{showMobileCalendar ? 'Скрыть' : 'Открыть'}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    showMobileCalendar ? 'rotate-180' : ''
                  }`}
                  strokeWidth={1.75}
                />
              </span>
            </button>

            <div
              className={`${
                showMobileCalendar ? 'mt-2.5 block' : 'hidden'
              } rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mt-0 sm:block sm:p-6`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-[#C86D2D]" strokeWidth={1.75} />
                  <div>
                    <h3 className="font-display text-base font-bold text-[#111827]">
                      Компактный календарь — {formatYearMonthRu(selectedCalendarMonth)}
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      Нажмите на дату в календаре, чтобы увидеть время занятий и записаться
                    </p>
                  </div>
                </div>

              {calendarMonths.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={monthIdx <= 0}
                    onClick={() => {
                      if (monthIdx > 0) {
                        setSelectedCalendarMonth(calendarMonths[monthIdx - 1]);
                        setSelectedCalendarDateKey(null);
                      }
                    }}
                    aria-label="Предыдущий месяц"
                    className="inline-flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    disabled={monthIdx >= calendarMonths.length - 1}
                    onClick={() => {
                      if (monthIdx < calendarMonths.length - 1) {
                        setSelectedCalendarMonth(calendarMonths[monthIdx + 1]);
                        setSelectedCalendarDateKey(null);
                      }
                    }}
                    aria-label="Следующий месяц"
                    className="inline-flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#6B7280] sm:gap-2">
              {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {calendarCells.map((cell) => {
                const hasLessons = cell.lessons.length > 0;
                const isSelected = selectedCalendarDateKey === cell.dateKey;
                const isClickable = cell.inMonth && (hasLessons || cell.isNoLessonsWeekend);

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    disabled={!isClickable}
                    onClick={() =>
                      setSelectedCalendarDateKey((prev) =>
                        prev === cell.dateKey ? null : cell.dateKey
                      )
                    }
                    className={`flex min-h-[58px] min-w-0 flex-col items-start justify-between overflow-hidden rounded-xl border p-1.5 text-left transition-colors sm:min-h-[76px] sm:p-2 ${
                      !cell.inMonth
                        ? 'border-transparent bg-transparent opacity-30'
                        : isSelected
                          ? 'cursor-pointer border-[#C86D2D] bg-[#FDF4ED] ring-1 ring-[#C86D2D]'
                          : hasLessons
                            ? 'cursor-pointer border-[#E5E7EB] bg-[#F9FAFB] hover:border-[#C86D2D]/60'
                            : cell.isNoLessonsWeekend
                              ? 'cursor-pointer border-[#FECACA] bg-[#FEF2F2]'
                              : 'border-[#F3F4F6] bg-white text-[#9CA3AF]'
                    }`}
                  >
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        cell.isNoLessonsWeekend
                          ? 'text-[#991B1B]'
                          : hasLessons
                            ? 'text-[#111827]'
                            : 'text-[#6B7280]'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {cell.inMonth && hasLessons && (
                      <div className="mt-1 w-full space-y-0.5 text-[10px] leading-tight font-medium text-[#374151] tabular-nums">
                        {cell.lessons.slice(0, 3).map((l) => (
                          <div key={l.id} className="truncate">
                            {formatSurgutTime(l.start_time)}
                          </div>
                        ))}
                        {cell.lessons.length > 3 && (
                          <div className="text-[9px] text-[#C86D2D]">
                            +{cell.lessons.length - 3}
                          </div>
                        )}
                      </div>
                    )}

                    {cell.isNoLessonsWeekend && (
                      <span className="mt-1 text-[9px] leading-tight font-semibold text-[#991B1B] sm:text-[10px]">
                        Нет занятий
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedCalendarCell && (
              <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-[#111827]">
                    {formatLongDateRu(selectedCalendarCell.dateKey)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCalendarDateKey(null)}
                    className="cursor-pointer text-xs font-medium text-[#6B7280] hover:text-[#111827]"
                  >
                    Закрыть
                  </button>
                </div>

                {selectedCalendarCell.lessons.length === 0 ? (
                  <p className="mt-1.5 text-xs font-medium text-[#991B1B]">
                    В этот день занятий нет.
                  </p>
                ) : (
                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {selectedCalendarCell.lessons.map((dayLesson) => {
                      const dStatus = getLessonStatusForFamily(dayLesson);
                      const dFull = dayLesson.free_spots === 0;
                      const dBusy = busyLessonId === dayLesson.id;

                      return (
                        <div
                          key={dayLesson.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#111827] tabular-nums">
                              {formatSurgutTime(dayLesson.start_time)} ·{' '}
                              {dayLesson.lesson_type === 'group'
                                ? 'Группа'
                                : lessonTypeLabel(dayLesson.lesson_type)}
                            </div>
                            <div className="truncate text-[11px] text-[#6B7280]">
                              {dFull
                                ? 'Мест нет'
                                : `Мест: ${dayLesson.free_spots} из ${dayLesson.capacity}`}
                            </div>
                          </div>

                          {dStatus.isAlreadyBooked && familyChildren.length <= 1 ? (
                            <span className="rounded-lg bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#065F46]">
                              Записан ✓
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={dBusy}
                              onClick={() => void handleBookFromSchedule(dayLesson)}
                              className="min-h-[34px] shrink-0 cursor-pointer rounded-lg bg-[#C86D2D] px-3 text-xs font-semibold text-white hover:bg-[#B05B20]"
                            >
                              {dFull ? 'Ожидание' : 'Записаться'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        )}
      </section>

      {/* Parent Reviews Section (full-width stacked cards on mobile, 3-col grid on md+) */}
      {!loading && (data?.reviews?.length ?? 0) > 0 && (
        <section className="mt-8 border-t border-[#E5E7EB] pt-6 sm:mt-12 sm:pt-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C86D2D]">
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Обратная связь семей</span>
              </div>
              <h2 className="mt-1 font-display text-xl font-bold text-[#111827] sm:text-2xl">
                Отзывы родителей
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111827] shadow-sm sm:gap-2 sm:px-3.5 sm:py-2">
                <Star className="h-4 w-4 fill-[#C86D2D] text-[#C86D2D]" strokeWidth={1.5} />
                <span className="font-display text-sm font-bold tabular-nums">
                  {(
                    (data?.reviews ?? []).reduce((sum, r) => sum + r.rating, 0) /
                    Math.max(1, (data?.reviews ?? []).length)
                  ).toFixed(1)}
                </span>
                <span className="text-[#6B7280] tabular-nums">
                  ({data?.reviews.length} отзывов)
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleBookFromSchedule()}
                className="min-h-[38px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB] sm:min-h-[40px] sm:px-3.5"
              >
                Оставить отзыв
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-5 md:grid-cols-3 md:gap-4">
            {(data?.reviews ?? []).map((review, idx) => (
              <motion.article
                key={review.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.2,
                  delay: Math.min(idx * 0.05, 0.2),
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={`${
                  !showAllMobileReviews && idx >= 2 ? 'hidden md:flex' : 'flex'
                } flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="flex items-center gap-0.5"
                      aria-label={`Оценка ${review.rating} из 5`}
                    >
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= review.rating
                              ? 'fill-[#C86D2D] text-[#C86D2D]'
                              : 'text-[#E5E7EB]'
                          }`}
                          strokeWidth={1.5}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-[#9CA3AF] tabular-nums">
                      {formatDateRu(review.created_at)}
                    </span>
                  </div>

                  <p className="mt-2.5 text-sm leading-relaxed text-[#374151] sm:mt-3">
                    {review.text}
                  </p>
                </div>

                <div className="mt-3 border-t border-[#F3F4F6] pt-2.5 sm:mt-4 sm:pt-3">
                  <div className="text-sm font-semibold text-[#111827]">{review.author_name}</div>
                  {review.child_info && (
                    <div className="text-xs text-[#6B7280]">{review.child_info}</div>
                  )}
                </div>
              </motion.article>
            ))}
          </div>

          {(data?.reviews?.length ?? 0) > 2 && (
            <div className="mt-3 md:hidden">
              <button
                type="button"
                onClick={() => setShowAllMobileReviews((prev) => !prev)}
                className="min-h-[40px] w-full cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-4 text-xs font-semibold text-[#111827] hover:bg-[#F9FAFB]"
              >
                {showAllMobileReviews
                  ? 'Скрыть часть отзывов'
                  : `Показать все отзывы (${data?.reviews.length ?? 0})`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Legal Document Viewer Modal */}
      <LegalDocumentModal doc={previewLegalDoc} onClose={() => setPreviewLegalDoc(null)} />
    </div>
  );
};
