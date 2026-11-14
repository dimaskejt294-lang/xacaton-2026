import {
  ArrowRight,
  Calendar,
  Clock,
  Hammer,
  KeyRound,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
  Star,
  User,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import craftFormatsImg from '../assets/images/yasna_craft_formats_1794650010759.jpg';
import workshopHeroImg from '../assets/images/yasna_workshop_hero_1794650010140.jpg';
import type { PublicLesson, ReviewItem, Tariff, WorkshopSettings } from '../types.ts';
import { formatDateRu, formatDateTimeRu, formatMoney, pluralizeLessons } from '../utils/format.ts';

interface PublicSchedulePageProps {
  onNavigate: (path: string) => void;
  savedFamilyToken: string | null;
}

interface PublicScheduleResponse {
  lessons: PublicLesson[];
  tariffs: Tariff[];
  settings: WorkshopSettings;
  reviews: ReviewItem[];
}

export const PublicSchedulePage: React.FC<PublicSchedulePageProps> = ({
  onNavigate,
  savedFamilyToken,
}) => {
  const [data, setData] = useState<PublicScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'group' | 'individual'>('all');

  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resolvingLink, setResolvingLink] = useState(false);

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

  useEffect(() => {
    void loadSchedule();
  }, []);

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
      onNavigate(`/lk/${body.token}`);
    } catch {
      setLinkError('Ошибка проверки ссылки. Попробуйте снова.');
    } finally {
      setResolvingLink(false);
    }
  };

  const handleBookFromSchedule = () => {
    if (savedFamilyToken) {
      onNavigate(`/lk/${savedFamilyToken}`);
      return;
    }
    const inputEl = document.getElementById('family-link-input');
    inputEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      inputEl?.focus();
    }, 250);
  };

  const filteredLessons = (data?.lessons ?? []).filter((lesson) =>
    filterType === 'all' ? true : lesson.lesson_type === filterType
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Hero Split */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12"
      >
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_10px_28px_-16px_rgba(17,24,39,0.08)] sm:p-8 lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#6B7280]">
              <MapPin className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
              <span>г. Сургут</span>
              <span aria-hidden="true">·</span>
              <span>Руководитель Денис Авимский</span>
            </div>

            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl [text-wrap:balance]">
              Детская столярная мастерская «Ясна»
            </h1>

            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#6B7280]">
              Живая работа с массивом сосны, кедра и дуба, ручным инструментом и токарным
              станком. Записывайтесь на занятия онлайн, отслеживайте остаток абонемента
              и получайте чеки без переписок.
            </p>

            {/* Concrete 4-fact grid */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-3">
                <div className="text-xs text-[#6B7280]">Возраст</div>
                <div className="mt-1 font-semibold text-[#111827] tabular-nums">6–14 лет</div>
              </div>
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-3">
                <div className="text-xs text-[#6B7280]">Длительность</div>
                <div className="mt-1 font-semibold text-[#111827] tabular-nums">90 минут</div>
              </div>
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-3">
                <div className="text-xs text-[#6B7280]">Группы</div>
                <div className="mt-1 font-semibold text-[#111827] tabular-nums">2–4 места</div>
              </div>
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-3">
                <div className="text-xs text-[#6B7280]">Отмена без списания</div>
                <div className="mt-1 font-semibold text-[#111827] tabular-nums">
                  за {data?.settings?.free_cancel_hours ?? 24} ч
                </div>
              </div>
            </div>
          </div>

          {/* Parent Personal Link Access Box */}
          <div className="mt-7 border-t border-[#E5E7EB] pt-6">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="family-link-input"
                className="flex items-center gap-2 text-sm font-semibold text-[#111827]"
              >
                <KeyRound className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                Вход в кабинет родителя по персональной ссылке
              </label>
              {savedFamilyToken && (
                <button
                  type="button"
                  onClick={() => onNavigate(`/lk/${savedFamilyToken}`)}
                  className="cursor-pointer whitespace-nowrap text-xs font-semibold text-[#C86D2D] hover:text-[#B05B20]"
                >
                  Вернуться в открытый кабинет
                </button>
              )}
            </div>

            <form onSubmit={handleOpenFamilyLink} className="mt-3 flex flex-col gap-2.5 sm:flex-row">
              <input
                id="family-link-input"
                type="text"
                value={linkInput}
                onChange={(e) => {
                  setLinkInput(e.target.value);
                  setLinkError(null);
                }}
                placeholder="Вставьте ссылку /lk/... или код семьи от мастера"
                className="min-h-[44px] flex-1 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 text-sm text-[#111827] placeholder-[#9CA3AF] transition-colors focus:border-[#C86D2D] focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={resolvingLink}
                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl bg-[#C86D2D] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#B05B20] active:scale-[0.98] disabled:opacity-60"
              >
                {resolvingLink ? 'Проверка...' : 'Открыть кабинет'}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </form>
            {linkError && (
              <p className="mt-2 text-xs font-medium text-[#991B1B]" role="alert">
                {linkError}
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Editorial Workshop Photography */}
        <div className="relative min-h-[260px] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_10px_28px_-16px_rgba(17,24,39,0.12)] lg:col-span-5">
          {!heroImgFailed ? (
            <img
              src={workshopHeroImg}
              alt="Верстак и столярные инструменты в детской мастерской Ясна"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center bg-gradient-to-br from-[#F9F4EE] to-[#EDE5DA] p-8 text-center">
              <Hammer className="h-10 w-10 text-[#C86D2D]" strokeWidth={1.5} />
              <div className="mt-3 font-display text-lg font-semibold text-[#111827]">
                Мастерская «Ясна»
              </div>
              <p className="mt-1 text-sm text-[#6B7280]">
                Живое столярное дело для детей в Сургуте
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-5">
            <div className="text-xs font-medium text-white/85">Живая практика с первого урока</div>
            <div className="mt-0.5 text-sm font-semibold text-white">
              Каждый ребёнок уносит готовое изделие домой
            </div>
          </div>
        </div>
      </motion.section>

      {/* Formats & Tariffs Section */}
      <motion.section
        id="formats-section"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12"
      >
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:col-span-4">
          <div className="aspect-[4/3] w-full overflow-hidden bg-[#F5F6F8]">
            {!craftImgFailed ? (
              <img
                src={craftFormatsImg}
                alt="Готовые детские изделия из дерева: скворечник, подставка и подсвечник"
                referrerPolicy="no-referrer"
                onError={() => setCraftImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#F9F4EE] text-[#C86D2D]">
                <Hammer className="h-8 w-8" strokeWidth={1.5} />
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

        <div className="flex flex-col justify-between gap-4 lg:col-span-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FDF4ED] text-[#C86D2D]">
                <Users className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-[#111827]">
                Групповая столярка
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">
                Небольшие группы до 4 детей. Разметка, пиление, шлифовка и сборка полок,
                шкатулок и кормушек.
              </p>
            </motion.div>

            <motion.div
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FDF4ED] text-[#C86D2D]">
                <User className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-[#111827]">
                Токарный станок
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">
                Индивидуально 1 на 1 с мастером. Освоение резцов и точение изделий из массива
                берёзы и кедра.
              </p>
            </motion.div>

            <motion.div
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FDF4ED] text-[#C86D2D]">
                <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-[#111827]">
                Отработка и перенос
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">
                Если ребёнок не смог прийти, выберите удобное время в другой группе прямо из
                личного кабинета.
              </p>
            </motion.div>
          </div>

          {/* Tariffs Strip */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-[#111827]">
                Действующие тарифы
              </h3>
              <span className="text-xs text-[#6B7280]">
                Оплата через СБП, картой или наличными
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(data?.tariffs ?? []).map((tariff) => (
                <div
                  key={tariff.id}
                  className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 sm:flex-col sm:items-start sm:gap-1"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#111827]">{tariff.title}</div>
                    <div className="text-xs text-[#6B7280] tabular-nums">
                      {pluralizeLessons(tariff.lessons_count)} · {tariff.validity_days} дн.
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
      <section className="mt-10">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#111827]">
              Актуальное расписание
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Свободные места обновляются в реальном времени
            </p>
          </div>

          {/* Filter tabs */}
          <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-white p-1">
            {(
              [
                { id: 'all', label: 'Все' },
                { id: 'group', label: 'Групповые' },
                { id: 'individual', label: 'Индивидуальные' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`min-h-[40px] cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors ${
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
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((skeleton) => (
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

        {!loading && !error && filteredLessons.length === 0 && (
          <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center">
            <Calendar className="mx-auto h-8 w-8 text-[#6B7280]" strokeWidth={1.5} />
            <div className="mt-3 font-display text-base font-semibold text-[#111827]">
              Подходящих занятий пока нет
            </div>
            <p className="mt-1 text-sm text-[#6B7280]">
              Попробуйте переключить фильтр формата или загляните позже.
            </p>
          </div>
        )}

        {!loading && !error && filteredLessons.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredLessons.map((lesson, idx) => {
              const isFull = lesson.free_spots === 0;
              const spotBadgeClass = isFull
                ? 'bg-[#FEF2F2] text-[#991B1B]'
                : lesson.free_spots === 1
                ? 'bg-[#FFFBEB] text-[#92400E]'
                : 'bg-[#ECFDF5] text-[#065F46]';

              return (
                <motion.article
                  key={lesson.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.2,
                    delay: Math.min(idx * 0.04, 0.2),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  whileHover={{ y: -2 }}
                  className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_20px_-14px_rgba(17,24,39,0.09)] transition-shadow hover:shadow-[0_4px_16px_-6px_rgba(17,24,39,0.12)]"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                        <span>
                          {lesson.lesson_type === 'group' ? 'Групповое' : 'Индивидуальное'}
                        </span>
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

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#F3F4F6] pt-4">
                    <div>
                      <div className="text-sm font-semibold text-[#111827] tabular-nums">
                        {formatDateTimeRu(lesson.start_time)}
                      </div>
                      <div className="text-xs text-[#6B7280] tabular-nums">
                        Разовое занятие: {formatMoney(lesson.single_price)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleBookFromSchedule}
                      className={`min-h-[44px] cursor-pointer whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                        isFull
                          ? 'border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] hover:bg-[#F3F4F6]'
                          : 'bg-[#C86D2D] text-white shadow-sm hover:bg-[#B05B20]'
                      }`}
                    >
                      {isFull ? 'Лист ожидания' : 'Записаться'}
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      {/* Parent Reviews Section */}
      {!loading && (data?.reviews?.length ?? 0) > 0 && (
        <section className="mt-12">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C86D2D]">
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Обратная связь семей</span>
              </div>
              <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#111827]">
                Отзывы родителей
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-xs font-medium text-[#111827] shadow-sm">
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
                onClick={handleBookFromSchedule}
                className="min-h-[40px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
              >
                Оставить отзыв в кабинете
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
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
                className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-0.5" aria-label={`Оценка ${review.rating} из 5`}>
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

                  <p className="mt-3 text-sm leading-relaxed text-[#374151]">{review.text}</p>
                </div>

                <div className="mt-4 border-t border-[#F3F4F6] pt-3">
                  <div className="text-sm font-semibold text-[#111827]">{review.author_name}</div>
                  {review.child_info && (
                    <div className="text-xs text-[#6B7280]">{review.child_info}</div>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-12 flex flex-col justify-between gap-4 border-t border-[#E5E7EB] pt-6 text-sm text-[#6B7280] sm:flex-row sm:items-center">
        <div>
          <div className="font-medium text-[#111827]">
            Детская столярная мастерская «Ясна»
          </div>
          <div className="mt-0.5 text-xs">
            г. Сургут · Руководитель Денис Авимский
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Phone className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
            +7 (922) 400-10-00
          </span>
          <button
            type="button"
            onClick={() => onNavigate('/master')}
            className="cursor-pointer font-medium text-[#111827] underline-offset-4 hover:underline"
          >
            Вход для мастера
          </button>
        </div>
      </footer>
    </div>
  );
};
