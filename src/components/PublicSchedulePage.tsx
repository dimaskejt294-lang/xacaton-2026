import {
  ArrowRight,
  Calendar,
  Clock,
  Download,
  Hammer,
  KeyRound,
  MapPin,
  MessageSquare,
  Sparkles,
  Star,
  User,
  Users,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import craftFormatsImg from '../assets/images/yasna_craft_formats_1794650010759.jpg';
import workshopHeroImg from '../assets/images/yasna_workshop_hero_1794650010140.jpg';
import type {
  LegalDocumentItem,
  LessonType,
  PublicLesson,
  ReviewItem,
  Tariff,
  WorkshopSettings,
} from '../types.ts';
import { formatDateRu, formatDateTimeRu, formatMoney, lessonTypeLabel, pluralizeLessons } from '../utils/format.ts';

interface PublicSchedulePageProps {
  onNavigate: (path: string) => void;
  savedFamilyToken: string | null;
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
}) => {
  const [data, setData] = useState<PublicScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | LessonType>('all');

  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resolvingLink, setResolvingLink] = useState(false);

  const [cabinetMode, setCabinetMode] = useState<'login' | 'register'>('login');
  const [regFullName, setRegFullName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMax, setRegMax] = useState('');
  const [regAge, setRegAge] = useState('10');
  const [regPersonalDataConsent, setRegPersonalDataConsent] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copiedRegLink, setCopiedRegLink] = useState(false);
  const [previewLegalDoc, setPreviewLegalDoc] = useState<LegalDocumentItem | null>(null);

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
    } catch (err) {
      console.warn('[PublicSchedulePage] Ошибка проверки ссылки:', err);
      setLinkError('Ошибка проверки ссылки. Попробуйте снова.');
    } finally {
      setResolvingLink(false);
    }
  };

  const handleSelfRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    if (!regPersonalDataConsent) {
      setLinkError('Необходимо дать согласие на обработку персональных данных');
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch('/api/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: regFullName.trim() || 'Новый ученик',
          child_name: regFullName.trim() || 'Новый ученик',
          phone: regPhone.trim() || 'Не указан',
          email: regEmail.trim(),
          max_contact: regMax.trim(),
          age: Number(regAge) || 10,
          personal_data_consent: true,
        }),
      });
      const body = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !body.token) {
        setLinkError(body.error || 'Не удалось создать личный кабинет ученика');
        return;
      }
      setCreatedToken(body.token);
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

  const handleBookFromSchedule = () => {
    if (savedFamilyToken) {
      onNavigate(`/lk/${savedFamilyToken}`);
      return;
    }
    setCabinetMode('register');
    const inputEl = document.getElementById('cabinet-access-section');
    inputEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
              <span>г. Сургут, ул. 30 лет Победы, 21/3</span>
              <span aria-hidden="true">·</span>
              <span>Руководитель Денис Авимский</span>
            </div>

            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl [text-wrap:balance]">
              Ясна — школа труда и столярная мастерская в Сургуте ☀️
            </h1>

            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#6B7280]">
              Здесь взрослые и дети от 6 лет учатся работать руками: пилить, шлифовать, собирать
              изделия из дерева и доводить дело до результата.
            </p>

            <p className="mt-2.5 max-w-2xl text-sm font-medium text-[#374151]">
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
                  value: s?.hero_age_text || '6–14 лет',
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
                  value: s?.hero_groups_text || '2–4 места',
                });
              }
              if ((s?.show_hero_free_cancel ?? 1) === 1) {
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
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-2 sm:grid-cols-4';
              return (
                <div className={`mt-6 grid gap-3 ${colsClass}`}>
                  {factCards.map((card) => (
                    <div
                      key={card.label}
                      className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-3"
                    >
                      <div className="text-xs text-[#6B7280]">{card.label}</div>
                      <div className="mt-1 font-semibold text-[#111827] tabular-nums">
                        {card.value}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Student / Parent Personal Link & Self-Registration Box */}
          <div id="cabinet-access-section" className="mt-7 border-t border-[#E5E7EB] pt-6">
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
                  Регистрация ученика (получить ссылку)
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
                <form onSubmit={handleOpenFamilyLink} className="mt-2 flex flex-col gap-2.5 sm:flex-row">
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
                    className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl bg-[#C86D2D] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#B05B20] active:scale-[0.98] disabled:opacity-60"
                  >
                    {resolvingLink ? 'Проверка...' : 'Открыть кабинет'}
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </form>
                <div className="mt-2.5 flex items-center justify-between text-xs text-[#6B7280]">
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
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/lk/${createdToken}`}
                    className="min-h-[40px] flex-1 rounded-lg border border-[#A7F3D0] bg-white px-3 text-xs font-mono text-[#111827]"
                  />
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
                <p className="mt-2 text-xs text-[#065F46]">
                  Сохраните эту ссылку — по ней вы всегда сможете войти в свой личный кабинет и заполнить или изменить анкету ученика.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSelfRegister} className="mt-3 space-y-3">
                <p className="text-xs text-[#6B7280]">
                  Заполните данные сейчас или нажмите «Получить ссылку и войти в ЛК», чтобы заполнить анкету (ФИО, телефон, почта, MAX, возраст) уже внутри личного кабинета:
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input
                    type="text"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="ФИО ученика / родителя"
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
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={regMax}
                      onChange={(e) => setRegMax(e.target.value)}
                      placeholder="Мессенджер MAX (ник / телефон)"
                      className="min-h-[42px] flex-1 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                    />
                    <input
                      type="number"
                      min={3}
                      max={99}
                      value={regAge}
                      onChange={(e) => setRegAge(e.target.value)}
                      placeholder="Возраст"
                      title="Возраст ученика"
                      className="min-h-[42px] w-24 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
                {(() => {
                  const personalDataDoc = data?.legal_documents?.find(
                    (d) => d.doc_key === 'personal_data'
                  );
                  const privacyDoc = data?.legal_documents?.find((d) => d.doc_key === 'privacy');
                  const offerDoc = data?.legal_documents?.find((d) => d.doc_key === 'offer');

                  return (
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
                          {personalDataDoc ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setPreviewLegalDoc(personalDataDoc);
                              }}
                              className="cursor-pointer font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                            >
                              «{personalDataDoc.title}»
                            </button>
                          ) : (
                            <a
                              href="/api/public/legal/personal_data/file?inline=1"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                            >
                              «Согласие на обработку персональных данных»
                            </a>
                          )}
                          , ознакомлен(а) с{' '}
                          {privacyDoc ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setPreviewLegalDoc(privacyDoc);
                              }}
                              className="cursor-pointer font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                            >
                              «{privacyDoc.title}»
                            </button>
                          ) : (
                            <a
                              href="/api/public/legal/privacy/file?inline=1"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                            >
                              «Политика конфиденциальности»
                            </a>
                          )}{' '}
                          и{' '}
                          {offerDoc ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setPreviewLegalDoc(offerDoc);
                              }}
                              className="cursor-pointer font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                            >
                              «{offerDoc.title}»
                            </button>
                          ) : (
                            <a
                              href="/api/public/legal/offer/file?inline=1"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-[#C86D2D] underline underline-offset-2 hover:text-[#B05B20]"
                            >
                              «Договор-оферта на оказание услуг»
                            </a>
                          )}
                          .
                        </span>
                      </label>
                    </div>
                  );
                })()}

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

        {/* Right Column: Editorial Workshop Photography */}
        <div className="relative min-h-[260px] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_10px_28px_-16px_rgba(17,24,39,0.12)] lg:col-span-5">
          {!heroImgFailed ? (
            <img
              src={workshopHeroImg}
              alt="Верстак и столярные инструменты в школе труда Ясна"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center bg-gradient-to-br from-[#F9F4EE] to-[#EDE5DA] p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FDF4ED] text-[#C86D2D] shadow-sm">
                <Hammer className="h-7 w-7" strokeWidth={1.75} />
              </div>
              <div className="mt-3 font-display text-lg font-semibold text-[#111827]">
                Школа труда «Ясна»
              </div>
              <p className="mt-1 text-sm text-[#6B7280]">
                Живое столярное дело для взрослых и детей от 6 лет в Сургуте
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-5">
            <div className="text-xs font-medium text-white/85">Живая практика с первого урока</div>
            <div className="mt-0.5 text-sm font-semibold text-white">
              Готовое изделие и навык работы руками на каждом занятии
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
                Группы и индивидуально
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">
                Взрослые и дети от 6 лет. Групповые занятия по субботам и воскресеньям в 10:00,
                13:00 и 16:00 — трудимся два часа, или индивидуально 1 на 1 с мастером.
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
                Семейные МК и дни рождения
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">
                Совместное творчество родителей и детей, а также праздники в мастерской, где
                каждый гость делает своё изделие.
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
                Мастер-классы для компаний
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">
                Командные столярные встречи и тимбилдинги: живая работа руками, смена
                обстановки и готовый результат для каждого участника.
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
              Групповые занятия в субботу и воскресенье: 10:00, 13:00 и 16:00 (трудимся 2 часа).
              Свободные места обновляются в реальном времени.
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

      {/* Legal Document Viewer Modal */}
      {previewLegalDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={previewLegalDoc.title}
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#6B7280]">Документ мастерской «Ясна»</div>
                <div className="truncate font-display text-sm font-semibold text-[#111827]">
                  {previewLegalDoc.title}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`/api/public/legal/${previewLegalDoc.doc_key}/file`}
                  download={previewLegalDoc.original_name || `${previewLegalDoc.doc_key}.txt`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3 text-xs font-medium text-white hover:bg-[#B05B20]"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Скачать
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewLegalDoc(null)}
                  aria-label="Закрыть документ"
                  className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[#F9FAFB] p-5">
              {previewLegalDoc.has_file === 1 &&
              previewLegalDoc.mime_type === 'application/pdf' ? (
                <iframe
                  src={`/api/public/legal/${previewLegalDoc.doc_key}/file?inline=1`}
                  title={previewLegalDoc.title}
                  className="h-[68vh] w-full rounded-xl border border-[#E5E7EB] bg-white"
                />
              ) : previewLegalDoc.has_file === 1 &&
                previewLegalDoc.mime_type?.startsWith('image/') ? (
                <div className="flex items-center justify-center">
                  <img
                    src={`/api/public/legal/${previewLegalDoc.doc_key}/file?inline=1`}
                    alt={previewLegalDoc.title}
                    className="max-h-[70vh] w-auto rounded-xl border border-[#E5E7EB] bg-white object-contain shadow-sm"
                  />
                </div>
              ) : previewLegalDoc.has_file === 1 &&
                previewLegalDoc.mime_type !== 'text/plain' ? (
                <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 text-center text-sm text-[#374151]">
                  <p>
                    Загружен файл: <strong>{previewLegalDoc.original_name}</strong>.
                  </p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    Нажмите «Скачать» выше, чтобы открыть файл на вашем устройстве.
                  </p>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap rounded-xl border border-[#E5E7EB] bg-white p-5 font-sans text-sm leading-relaxed text-[#111827]">
                  {previewLegalDoc.content_text}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
