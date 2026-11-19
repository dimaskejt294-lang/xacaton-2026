import {
  AlertCircle,
  Bell,
  BellRing,
  Calendar,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Grid3x3,
  History,
  List,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Star,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useState } from 'react';
import type { BookingStatus, LegalDocKey, LessonType, MasterDashboardData, MasterLesson } from '../types.ts';
import {
  bookingStatusClasses,
  bookingStatusLabel,
  defaultNextWeekendDatetimeLocal,
  formatDateRu,
  formatDateTimeRu,
  formatMoney,
  isoToSurgutDatetimeLocal,
  lessonTypeLabel,
  paymentMethodLabel,
  paymentStatusClasses,
  paymentStatusLabel,
  pluralizeLessons,
  pluralizeYears,
  surgutDatetimeLocalToIso,
} from '../utils/format.ts';
import { ScheduleCalendarView } from './ScheduleCalendarView.tsx';
import { SchoolJournalGrid } from './SchoolJournalGrid.tsx';

interface MasterPanelPageProps {
  onNavigate: (path: string) => void;
}

type MasterTab = 'schedule' | 'grid' | 'families' | 'payments' | 'settings';

function isSafeReceiptUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed, window.location.origin);
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    return isHttps || isLocalHttp;
  } catch {
    return false;
  }
}



export const MasterPanelPage: React.FC<MasterPanelPageProps> = ({ onNavigate }) => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [data, setData] = useState<MasterDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<MasterTab>('schedule');
  const [scheduleViewMode, setScheduleViewMode] = useState<'calendar' | 'list'>('calendar');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create / edit lesson state
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [lessonTitle, setLessonTitle] = useState('Групповое занятие');
  const [lessonType, setLessonType] = useState<LessonType>('group');
  const [lessonStart, setLessonStart] = useState(defaultNextWeekendDatetimeLocal);
  const [lessonDuration, setLessonDuration] = useState(120);
  const [lessonCapacity, setLessonCapacity] = useState(4);
  const [lessonPrice, setLessonPrice] = useState(1600);
  const [lessonDesc, setLessonDesc] = useState('');
  const [showCancelDateBox, setShowCancelDateBox] = useState(false);
  const [cancelDateInput, setCancelDateInput] = useState('');

  // Quick enroll per lesson
  const [enrollChildMap, setEnrollChildMap] = useState<Record<number, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<number, string>>({});
  const [confirmCancelLessonId, setConfirmCancelLessonId] = useState<number | null>(null);

  // New family, child & tariffs / subscriptions state
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [newParentName, setNewParentName] = useState('');
  const [newParentPhone, setNewParentPhone] = useState('');
  const [newParentEmail, setNewParentEmail] = useState('');
  const [newParentMax, setNewParentMax] = useState('');
  const [newChildName, setNewChildName] = useState('');
  const [newChildAge, setNewChildAge] = useState(8);

  // Student Card Modal state
  const [selectedStudentCard, setSelectedStudentCard] = useState<{
    familyId: number;
    childId?: number;
  } | null>(null);
  const [cardParentName, setCardParentName] = useState('');
  const [cardPhone, setCardPhone] = useState('');
  const [cardEmail, setCardEmail] = useState('');
  const [cardMax, setCardMax] = useState('');
  const [cardChildId, setCardChildId] = useState<number | null>(null);
  const [cardChildName, setCardChildName] = useState('');
  const [cardChildAge, setCardChildAge] = useState(10);
  const [savingStudentCard, setSavingStudentCard] = useState(false);

  const [addChildFamilyId, setAddChildFamilyId] = useState<number | null>(null);
  const [extraChildName, setExtraChildName] = useState('');
  const [extraChildAge, setExtraChildAge] = useState(8);
  const [confirmRegenFamilyId, setConfirmRegenFamilyId] = useState<number | null>(null);
  const [confirmDeleteReviewId, setConfirmDeleteReviewId] = useState<number | null>(null);

  const [showNewTariff, setShowNewTariff] = useState(false);
  const [tariffTitle, setTariffTitle] = useState('');
  const [tariffLessonsCount, setTariffLessonsCount] = useState(6);
  const [tariffPrice, setTariffPrice] = useState(5800);
  const [tariffValidityDays, setTariffValidityDays] = useState(45);

  const [editingTariffId, setEditingTariffId] = useState<number | null>(null);
  const [editTariffTitle, setEditTariffTitle] = useState('');
  const [editTariffLessons, setEditTariffLessons] = useState(4);
  const [editTariffPrice, setEditTariffPrice] = useState(5500);
  const [editTariffValidity, setEditTariffValidity] = useState(45);

  const [addSubFamilyId, setAddSubFamilyId] = useState<number | null>(null);
  const [subTariffChoice, setSubTariffChoice] = useState<string>('custom');
  const [subCustomTitle, setSubCustomTitle] = useState('Абонемент на 4 занятия');
  const [subCustomLessons, setSubCustomLessons] = useState(4);
  const [subCustomDays, setSubCustomDays] = useState(45);

  // Manual payment state
  const [payFamilyId, setPayFamilyId] = useState<string>('');
  const [payTariffId, setPayTariffId] = useState<string>('');
  const [payTariffAmount, setPayTariffAmount] = useState<string>('');
  const [payCustomAmount, setPayCustomAmount] = useState('1600');
  const [payCustomLessons, setPayCustomLessons] = useState('0');
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer'>('cash');

  // Receipts state
  const [receiptUrlInputs, setReceiptUrlInputs] = useState<Record<number, string>>({});
  const [previewReceipt, setPreviewReceipt] = useState<{
    name: string;
    blobUrl: string;
    isPdf: boolean;
  } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // Settings & CSV import state
  const [freeCancelHours, setFreeCancelHours] = useState(24);
  const [chargeOnMiss, setChargeOnMiss] = useState(true);
  const [chargeOnLateCancel, setChargeOnLateCancel] = useState(true);
  const [defaultGroupCapacity, setDefaultGroupCapacity] = useState(4);
  const [applyCapacityToUpcoming, setApplyCapacityToUpcoming] = useState(false);
  const [showHeroAge, setShowHeroAge] = useState(true);
  const [heroAgeText, setHeroAgeText] = useState('От 6 лет');
  const [showHeroDuration, setShowHeroDuration] = useState(true);
  const [heroDurationText, setHeroDurationText] = useState('2 часа');
  const [showHeroGroups, setShowHeroGroups] = useState(true);
  const [heroGroupsText, setHeroGroupsText] = useState('до 4 мест');
  const [showHeroFreeCancel, setShowHeroFreeCancel] = useState(false);
  const [csvImportText, setCsvImportText] = useState('');
  const [moyKlassRows, setMoyKlassRows] = useState<
    Array<{
      child_name: string;
      phone: string;
      email: string;
      max_contact: string;
      age: string;
      parent_name: string;
      remaining_lessons: string;
    }>
  >([
    {
      child_name: '',
      phone: '',
      email: '',
      max_contact: '',
      age: '10',
      parent_name: '',
      remaining_lessons: '0',
    },
  ]);
  const [editingLegalKey, setEditingLegalKey] = useState<LegalDocKey | null>(null);
  const [legalTitleInput, setLegalTitleInput] = useState('');
  const [legalTextInput, setLegalTextInput] = useState('');

  // Password change state
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Broadcast test notification state
  const [broadcastTitle, setBroadcastTitle] = useState(
    'Тестовое уведомление от мастерской «Ясна»'
  );
  const [broadcastMessage, setBroadcastMessage] = useState(
    'Проверка связи! Сюда приходят напоминания о занятиях, чеки об оплате и отметки посещаемости.'
  );
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const masterFetch = useCallback(
    (input: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (sessionToken) {
        headers.set('Authorization', `Bearer ${sessionToken}`);
      }
      return fetch(input, {
        ...init,
        headers,
        credentials: 'same-origin',
      });
    },
    [sessionToken]
  );

  useEffect(() => {
    const activeBlobUrl = previewReceipt?.blobUrl;
    return () => {
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [previewReceipt]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await masterFetch('/api/master/dashboard');
      if (res.status === 401) {
        setSessionToken(null);
        setAuthenticated(false);
        setData(null);
        return;
      }
      if (!res.ok) {
        throw new Error('Ошибка загрузки данных мастера');
      }
      const json = (await res.json()) as MasterDashboardData;
      setData(json);
      setFreeCancelHours(json.settings.free_cancel_hours);
      setChargeOnMiss(json.settings.charge_on_miss === 1);
      setChargeOnLateCancel(json.settings.charge_on_late_cancel === 1);
      setDefaultGroupCapacity(json.settings.default_group_capacity ?? 4);
      setShowHeroAge((json.settings.show_hero_age ?? 1) === 1);
      setHeroAgeText(json.settings.hero_age_text || 'От 6 лет');
      setShowHeroDuration((json.settings.show_hero_duration ?? 1) === 1);
      setHeroDurationText(json.settings.hero_duration_text || '2 часа');
      setShowHeroGroups((json.settings.show_hero_groups ?? 1) === 1);
      setHeroGroupsText(json.settings.hero_groups_text || 'до 4 мест');
      setShowHeroFreeCancel((json.settings.show_hero_free_cancel ?? 0) === 1);

      if (json.families.length > 0 && !payFamilyId) {
        setPayFamilyId(String(json.families[0].id));
      }
      const firstActiveTariff = json.tariffs.find((t) => t.is_active !== 0) ?? json.tariffs[0];
      if (firstActiveTariff && !payTariffId) {
        setPayTariffId(String(firstActiveTariff.id));
        setPayTariffAmount(String(firstActiveTariff.price));
      }
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось загрузить панель мастера',
      });
    } finally {
      setLoading(false);
    }
  }, [masterFetch, payFamilyId, payTariffId]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await masterFetch('/api/master/session');
        const body = (await res.json()) as { authenticated: boolean };
        setAuthenticated(body.authenticated);
        if (body.authenticated) {
          await loadDashboard();
        } else {
          setSessionToken(null);
        }
      } catch (err) {
        console.warn('[MasterPanel] Ошибка проверки сессии:', err);
        setAuthenticated(false);
      }
    };
    void checkSession();
  }, [masterFetch, loadDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await fetch('/api/master/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });
      const body = (await res.json()) as { session_token?: string; error?: string };
      if (!res.ok) {
        setLoginError(body.error || 'Неверный пароль');
        return;
      }
      if (body.session_token) {
        setSessionToken(body.session_token);
      }
      setPassword('');
      setAuthenticated(true);
      await loadDashboard();
    } catch (err) {
      console.error('[MasterPanel] Ошибка авторизации мастера:', err);
      setLoginError('Ошибка входа. Проверьте соединение.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await masterFetch('/api/master/logout', { method: 'POST' });
    setSessionToken(null);
    setAuthenticated(false);
    setData(null);
  };

  const resetLessonForm = () => {
    setEditingLessonId(null);
    setLessonTitle('Групповое занятие');
    setLessonType('group');
    setLessonStart(defaultNextWeekendDatetimeLocal());
    setLessonDuration(120);
    setLessonCapacity(defaultGroupCapacity);
    setLessonPrice(1600);
    setLessonDesc('');
  };

  const startEditLesson = (lesson: MasterLesson) => {
    setBanner(null);
    setEditingLessonId(lesson.id);
    setLessonTitle(lesson.title);
    setLessonType(lesson.lesson_type);
    setLessonStart(isoToSurgutDatetimeLocal(lesson.start_time));
    setLessonDuration(lesson.duration_minutes);
    setLessonCapacity(lesson.capacity);
    setLessonPrice(lesson.single_price);
    setLessonDesc(lesson.description ?? '');
    setShowNewLesson(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startCreateLessonOnDate = (dateKey: string) => {
    setBanner(null);
    resetLessonForm();
    setLessonStart(`${dateKey}T10:00`);
    setShowNewLesson(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const isEditing = editingLessonId !== null;
    const url = isEditing ? `/api/master/lessons/${editingLessonId}` : '/api/master/lessons';
    const res = await masterFetch(url, {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: lessonTitle,
        lesson_type: lessonType,
        start_time: surgutDatetimeLocalToIso(lessonStart),
        duration_minutes: lessonDuration,
        capacity: lessonType === 'individual' ? 1 : lessonCapacity,
        single_price: lessonPrice,
        description: lessonDesc,
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({
        type: 'error',
        text: body.error || (isEditing ? 'Не удалось обновить занятие' : 'Не удалось создать занятие'),
      });
      return;
    }
    resetLessonForm();
    setShowNewLesson(false);
    setBanner({
      type: 'success',
      text: isEditing ? 'Параметры занятия обновлены.' : 'Занятие добавлено в расписание.',
    });
    await loadDashboard();
  };

  const handleCancelLesson = async (lessonId: number) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/lessons/${lessonId}/cancel`, { method: 'PATCH' });
    const body = (await res.json()) as { error?: string };
    setConfirmCancelLessonId(null);
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось отменить занятие' });
      return;
    }
    setBanner({ type: 'success', text: 'Занятие отменено, записанные семьи уведомлены.' });
    await loadDashboard();
  };

  const handleCancelDate = async (dateKey: string) => {
    setBanner(null);
    const res = await masterFetch('/api/master/lessons/cancel-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateKey }),
    });
    const body = (await res.json()) as {
      canceled_count?: number;
      canceled_bookings_count?: number;
      error?: string;
    };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось отменить дату' });
      return;
    }
    setShowCancelDateBox(false);
    setCancelDateInput('');
    setBanner({
      type: 'success',
      text: `Дата ${dateKey} отменена: снято занятий — ${body.canceled_count ?? 0}, отменённых записей — ${body.canceled_bookings_count ?? 0}. Остальное расписание сохранено.`,
    });
    await loadDashboard();
  };

  const handleEnrollChildByIds = async (lessonId: number, childId: number) => {
    setBanner(null);
    const res = await masterFetch('/api/master/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: lessonId, child_id: childId }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось записать ребёнка' });
      return;
    }
    setBanner({ type: 'success', text: 'Ребёнок записан на занятие.' });
    await loadDashboard();
  };

  const handleMasterEnroll = async (lessonId: number) => {
    const childId = Number(enrollChildMap[lessonId]);
    if (!childId) {
      setBanner({ type: 'error', text: 'Выберите ребёнка для записи' });
      return;
    }
    await handleEnrollChildByIds(lessonId, childId);
  };

  const handleMarkStatus = async (
    bookingId: number,
    status: BookingStatus,
    explicitReason?: string
  ) => {
    setBanner(null);
    const reason = (explicitReason ?? reasonMap[bookingId])?.trim();
    const res = await masterFetch(`/api/master/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось обновить отметку' });
      return;
    }
    setReasonMap((prev) => {
      const next = { ...prev };
      delete next[bookingId];
      return next;
    });
    setBanner({ type: 'success', text: `Отметка обновлена: «${bookingStatusLabel(status)}».` });
    await loadDashboard();
  };

  const handleConvertWaitlist = async (waitlistId: number) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/waitlist/${waitlistId}/convert`, { method: 'POST' });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось перевести из листа ожидания' });
      return;
    }
    setBanner({ type: 'success', text: 'Ребёнок переведён из листа ожидания в основную запись.' });
    await loadDashboard();
  };

  const openStudentCard = useCallback(
    (familyId: number, childId?: number) => {
      const fam = data?.families.find((f) => f.id === familyId);
      if (!fam) return;
      const chosenChild =
        (childId ? fam.children.find((c) => c.id === childId) : undefined) ?? fam.children[0];
      setSelectedStudentCard({ familyId: fam.id, childId: chosenChild?.id });
      setCardParentName(fam.parent_name);
      setCardPhone(fam.phone);
      setCardEmail(fam.email ?? '');
      setCardMax(fam.max_contact ?? '');
      setCardChildId(chosenChild?.id ?? null);
      setCardChildName(chosenChild?.name ?? fam.parent_name);
      setCardChildAge(chosenChild?.age ?? 10);
    },
    [data]
  );

  const handleSaveStudentCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentCard) return;
    setBanner(null);
    setSavingStudentCard(true);
    try {
      const res = await masterFetch(
        `/api/master/families/${selectedStudentCard.familyId}/profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parent_name: cardParentName,
            phone: cardPhone,
            email: cardEmail,
            max_contact: cardMax,
            child_id: cardChildId,
            child_name: cardChildName,
            child_age: cardChildAge,
          }),
        }
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBanner({ type: 'error', text: body.error || 'Не удалось обновить карточку ученика' });
        return;
      }
      setBanner({ type: 'success', text: 'Данные карточки ученика сохранены.' });
      await loadDashboard();
    } catch (err) {
      console.error('[MasterPanel] Ошибка сохранения карточки ученика:', err);
      setBanner({ type: 'error', text: 'Ошибка сети при сохранении карточки ученика' });
    } finally {
      setSavingStudentCard(false);
    }
  };

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const res = await masterFetch('/api/master/families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_name: newParentName,
        phone: newParentPhone,
        email: newParentEmail,
        max_contact: newParentMax,
        child_name: newChildName || newParentName,
        child_age: newChildAge,
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось создать семью' });
      return;
    }
    setNewParentName('');
    setNewParentPhone('');
    setNewParentEmail('');
    setNewParentMax('');
    setNewChildName('');
    setShowNewFamily(false);
    setBanner({ type: 'success', text: 'Ученик / семья добавлены, персональная ссылка сгенерирована.' });
    await loadDashboard();
  };

  const handleAddChildToFamily = async (familyId: number) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/families/${familyId}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: extraChildName, age: extraChildAge }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось добавить ребёнка' });
      return;
    }
    setExtraChildName('');
    setAddChildFamilyId(null);
    setBanner({ type: 'success', text: 'Профиль ребёнка добавлен в семью.' });
    await loadDashboard();
  };

  const handleRegenerateToken = async (familyId: number) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/families/${familyId}/regenerate-token`, {
      method: 'POST',
    });
    const body = (await res.json()) as { error?: string };
    setConfirmRegenFamilyId(null);
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось перевыпустить ссылку' });
      return;
    }
    setBanner({
      type: 'success',
      text: 'Старая ссылка отозвана. Выпущена новая персональная ссылка семьи.',
    });
    await loadDashboard();
  };

  const handleSendReminder = async (familyId: number, parentName: string) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/families/${familyId}/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setBanner({ type: 'error', text: 'Не удалось отправить напоминание' });
      return;
    }
    setBanner({
      type: 'success',
      text: `Напоминание о продлении отправлено в кабинет (${parentName}).`,
    });
  };

  const handleCreateTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const res = await masterFetch('/api/master/tariffs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: tariffTitle,
        lessons_count: tariffLessonsCount,
        price: tariffPrice,
        validity_days: tariffValidityDays,
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось создать тариф абонемента' });
      return;
    }
    setTariffTitle('');
    setShowNewTariff(false);
    setBanner({
      type: 'success',
      text: 'Новый тариф абонемента добавлен и доступен родителям.',
    });
    await loadDashboard();
  };

  const handleToggleTariff = async (tariffId: number) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/tariffs/${tariffId}/toggle`, {
      method: 'PATCH',
    });
    const body = (await res.json()) as { is_active?: number; error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось изменить статус тарифа' });
      return;
    }
    setBanner({
      type: 'success',
      text: body.is_active === 1 ? 'Тариф снова виден родителям.' : 'Тариф скрыт из витрины.',
    });
    await loadDashboard();
  };

  const startEditTariff = (t: MasterDashboardData['tariffs'][number]) => {
    setEditingTariffId(t.id);
    setEditTariffTitle(t.title);
    setEditTariffLessons(t.lessons_count);
    setEditTariffPrice(t.price);
    setEditTariffValidity(t.validity_days);
  };

  const handleSaveTariffEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTariffId) return;
    setBanner(null);
    const res = await masterFetch(`/api/master/tariffs/${editingTariffId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTariffTitle,
        lessons_count: editTariffLessons,
        price: editTariffPrice,
        validity_days: editTariffValidity,
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось обновить тариф' });
      return;
    }
    setEditingTariffId(null);
    setBanner({ type: 'success', text: 'Тариф обновлён.' });
    await loadDashboard();
  };

  const openGrantSubscription = (familyId: number) => {
    if (addSubFamilyId === familyId) {
      setAddSubFamilyId(null);
      return;
    }
    const firstActive = data?.tariffs.find((t) => t.is_active !== 0);
    setSubTariffChoice(firstActive ? String(firstActive.id) : 'custom');
    setSubCustomTitle('Абонемент на 4 занятия');
    setSubCustomLessons(4);
    setSubCustomDays(45);
    setAddSubFamilyId(familyId);
  };

  const handleGrantSubscription = async (familyId: number) => {
    setBanner(null);
    const payload =
      subTariffChoice === 'custom'
        ? {
            title: subCustomTitle,
            lessons_count: subCustomLessons,
            validity_days: subCustomDays,
          }
        : {
            tariff_id: Number(subTariffChoice),
          };
    const res = await masterFetch(`/api/master/families/${familyId}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось начислить абонемент' });
      return;
    }
    setAddSubFamilyId(null);
    setBanner({
      type: 'success',
      text: 'Абонемент добавлен семье, уведомление отправлено в личный кабинет.',
    });
    await loadDashboard();
  };

  const handleCopyLink = async (token: string) => {
    const fullUrl = `${window.location.origin}/lk/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setBanner({ type: 'success', text: 'Персональная ссылка семьи скопирована в буфер обмена.' });
    } catch (err) {
      console.warn('[MasterPanel] Не удалось скопировать ссылку в буфер обмена:', err);
      setBanner({
        type: 'error',
        text: 'Не удалось автоматически скопировать ссылку. Проверьте разрешения буфера обмена в браузере.',
      });
    }
  };

  const handleManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const parsedTariffAmount = Number(payTariffAmount);
    const payload =
      payTariffId === 'custom'
        ? {
            family_id: Number(payFamilyId),
            amount: Number(payCustomAmount),
            lessons_count: Number(payCustomLessons),
            payment_method: payMethod,
          }
        : {
            family_id: Number(payFamilyId),
            tariff_id: Number(payTariffId),
            ...(Number.isFinite(parsedTariffAmount) && parsedTariffAmount > 0
              ? { amount: parsedTariffAmount }
              : {}),
            payment_method: payMethod,
          };

    const res = await masterFetch('/api/master/payments/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Ошибка проведения оплаты' });
      return;
    }
    setBanner({ type: 'success', text: 'Оплата внесена и зачислена на баланс семьи.' });
    await loadDashboard();
  };

  const handleAttachReceiptUrl = async (paymentId: number) => {
    const url = receiptUrlInputs[paymentId] ?? '';
    setBanner(null);
    const res = await masterFetch(`/api/master/payments/${paymentId}/receipt-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt_url: url }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось сохранить ссылку на чек' });
      return;
    }
    setBanner({ type: 'success', text: 'Ссылка на чек из «Мой налог» прикреплена.' });
    await loadDashboard();
  };

  const handleUploadReceiptFile = async (paymentId: number, file: File | undefined) => {
    if (!file) return;
    setBanner(null);
    const formData = new FormData();
    formData.append('file', file);
    const res = await masterFetch(`/api/master/payments/${paymentId}/receipt-file`, {
      method: 'POST',
      body: formData,
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Ошибка загрузки файла чека' });
      return;
    }
    setBanner({ type: 'success', text: 'Файл чека загружен и доступен родителю.' });
    await loadDashboard();
  };

  const handleDownloadMasterFile = async (url: string, fallbackName: string, key: string) => {
    setBanner(null);
    setDownloadingKey(key);
    try {
      const res = await masterFetch(url);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setBanner({ type: 'error', text: body.error || 'Не удалось скачать файл' });
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error('[MasterPanel] Ошибка сети при скачивании файла:', err);
      setBanner({ type: 'error', text: 'Ошибка сети при скачивании файла' });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleOpenMasterReceipt = async (paymentId: number, originalName?: string | null) => {
    setBanner(null);
    setDownloadingKey(`receipt-view-${paymentId}`);
    try {
      const res = await masterFetch(`/api/files/receipts/${paymentId}?inline=1`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setBanner({ type: 'error', text: body.error || 'Не удалось открыть файл чека' });
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const name = originalName || `Чек_${paymentId}`;
      const isPdf = blob.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
      setPreviewReceipt({ name, blobUrl, isPdf });
    } catch (err) {
      console.error('[MasterPanel] Ошибка сети при загрузке файла чека:', err);
      setBanner({ type: 'error', text: 'Ошибка сети при загрузке файла чека' });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const res = await masterFetch('/api/master/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        free_cancel_hours: freeCancelHours,
        charge_on_miss: chargeOnMiss,
        charge_on_late_cancel: chargeOnLateCancel,
        default_group_capacity: defaultGroupCapacity,
        apply_capacity_to_upcoming_groups: applyCapacityToUpcoming,
        show_hero_age: showHeroAge,
        hero_age_text: heroAgeText,
        show_hero_duration: showHeroDuration,
        hero_duration_text: heroDurationText,
        show_hero_groups: showHeroGroups,
        hero_groups_text: heroGroupsText,
        show_hero_free_cancel: showHeroFreeCancel,
      }),
    });
    const body = (await res.json()) as { updated_lessons_count?: number; error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось сохранить настройки' });
      return;
    }
    setApplyCapacityToUpcoming(false);
    setBanner({
      type: 'success',
      text:
        body.updated_lessons_count && body.updated_lessons_count > 0
          ? `Настройки сохранены, вместимость обновлена у ${body.updated_lessons_count} будущих групповых занятий.`
          : 'Настройки мастерской и карточки на главной обновлены.',
    });
    await loadDashboard();
  };

  const parseTableTextIntoRows = (rawText: string) => {
    const lines = rawText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return;

    const splitLine = (line: string) => {
      const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      return line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
    };

    const firstCols = splitLine(lines[0]);
    const hasHeader = firstCols.some((c) =>
      /фио|имя|ученик|клиент|родител|заказчик|телефон|phone|email|почта|возраст|рожд|остаток|абонем|баланс/i.test(
        c
      )
    );

    let idxChild = -1;
    let idxParent = -1;
    let idxPhone = -1;
    let idxEmail = -1;
    let idxMax = -1;
    let idxAge = -1;
    let idxLessons = -1;

    if (hasHeader) {
      firstCols.forEach((col, idx) => {
        const h = col.toLowerCase();
        if (idxChild === -1 && /ученик|реб[её]нок|клиент|фио|имя/.test(h) && !/родител|заказчик|ответствен/.test(h)) {
          idxChild = idx;
        } else if (idxParent === -1 && /родител|заказчик|ответствен|контакт/.test(h)) {
          idxParent = idx;
        } else if (idxPhone === -1 && /телефон|phone|моб|номер/.test(h) && !/max|макс/.test(h)) {
          idxPhone = idx;
        } else if (idxEmail === -1 && /email|e-mail|почт|mail/.test(h)) {
          idxEmail = idx;
        } else if (idxMax === -1 && /max|макс|мессендж|коммент|примеч/.test(h)) {
          idxMax = idx;
        } else if (idxAge === -1 && /возраст|рожд|age|лет/.test(h)) {
          idxAge = idx;
        } else if (idxLessons === -1 && /остаток|занят|абонем|уроков/.test(h)) {
          idxLessons = idx;
        }
      });
    }

    const nextRows: typeof moyKlassRows = [];
    const startIdx = hasHeader ? 1 : 0;
    for (let i = startIdx; i < lines.length; i += 1) {
      const cols = splitLine(lines[i]);
      if (cols.every((c) => !c)) continue;

      if (hasHeader && (idxChild !== -1 || idxParent !== -1 || idxPhone !== -1)) {
        const childName = idxChild !== -1 ? (cols[idxChild] ?? '') : (cols[idxParent] ?? '');
        const parentName = idxParent !== -1 ? (cols[idxParent] ?? '') : childName;
        nextRows.push({
          child_name: childName,
          phone: idxPhone !== -1 ? (cols[idxPhone] ?? '') : '',
          email: idxEmail !== -1 ? (cols[idxEmail] ?? '') : '',
          max_contact: idxMax !== -1 ? (cols[idxMax] ?? '') : '',
          age: idxAge !== -1 ? (cols[idxAge] || '10') : '10',
          parent_name: parentName,
          remaining_lessons: idxLessons !== -1 ? (cols[idxLessons] || '0') : '0',
        });
      } else if ((cols[2] ?? '').includes('@') || cols.length >= 6) {
        nextRows.push({
          child_name: cols[0] ?? '',
          phone: cols[1] ?? '',
          email: cols[2] ?? '',
          max_contact: cols[3] ?? '',
          age: cols[4] || '10',
          parent_name: cols[5] && isNaN(Number(cols[5])) ? cols[5] : (cols[0] ?? ''),
          remaining_lessons:
            cols[5] && !isNaN(Number(cols[5])) ? cols[5] : (cols[6] || '0'),
        });
      } else {
        nextRows.push({
          child_name: cols[2] || cols[0] || '',
          phone: cols[1] ?? '',
          email: '',
          max_contact: '',
          age: cols[3] || '10',
          parent_name: cols[0] ?? '',
          remaining_lessons: cols[4] || '0',
        });
      }
    }

    if (nextRows.length > 0) {
      setMoyKlassRows(nextRows);
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const nonEmptyRows = moyKlassRows.filter(
      (r) => r.child_name.trim() !== '' || r.parent_name.trim() !== ''
    );
    const payload =
      nonEmptyRows.length > 0
        ? { rows: nonEmptyRows, csv_text: csvImportText }
        : { csv_text: csvImportText };

    const res = await masterFetch('/api/master/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as {
      importedFamilies?: number;
      importedChildren?: number;
      error?: string;
    };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Ошибка импорта таблицы «МойКласс»' });
      return;
    }
    setCsvImportText('');
    setMoyKlassRows([
      {
        child_name: '',
        phone: '',
        email: '',
        max_contact: '',
        age: '10',
        parent_name: '',
        remaining_lessons: '0',
      },
    ]);
    setBanner({
      type: 'success',
      text: `Импортировано из таблицы «МойКласс» — семей: ${body.importedFamilies ?? 0}, учеников: ${body.importedChildren ?? 0}.`,
    });
    await loadDashboard();
  };

  const handleToggleReview = async (reviewId: number) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/reviews/${reviewId}/toggle`, {
      method: 'PATCH',
    });
    const body = (await res.json()) as { is_published?: number; error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось обновить статус отзыва' });
      return;
    }
    setBanner({
      type: 'success',
      text:
        body.is_published === 1
          ? 'Отзыв опубликован на странице расписания.'
          : 'Отзыв скрыт со страницы расписания.',
    });
    await loadDashboard();
  };

  const handleDeleteReview = async (reviewId: number) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/reviews/${reviewId}`, {
      method: 'DELETE',
    });
    setConfirmDeleteReviewId(null);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setBanner({ type: 'error', text: body.error || 'Не удалось удалить отзыв' });
      return;
    }
    setBanner({ type: 'success', text: 'Отзыв удалён.' });
    await loadDashboard();
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    setSendingBroadcast(true);
    try {
      const res = await masterFetch('/api/master/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: broadcastTitle,
          message: broadcastMessage,
        }),
      });
      const body = (await res.json()) as {
        families_count?: number;
        push_sent?: number;
        error?: string;
      };
      if (!res.ok) {
        setBanner({
          type: 'error',
          text: body.error || 'Не удалось отправить уведомление семьям',
        });
        return;
      }
      setBanner({
        type: 'success',
        text: `Уведомление отправлено в кабинеты всех семей (${
          body.families_count ?? 0
        }), push-доставка на устройства: ${body.push_sent ?? 0}.`,
      });
    } catch (err) {
      console.error('[MasterPanel] Ошибка сети при рассылке уведомления:', err);
      setBanner({
        type: 'error',
        text: 'Ошибка сети при рассылке уведомления',
      });
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    if (newPasswordInput.length < 6) {
      setBanner({ type: 'error', text: 'Новый пароль должен содержать минимум 6 символов' });
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setBanner({ type: 'error', text: 'Новый пароль и подтверждение не совпадают' });
      return;
    }
    setChangingPassword(true);
    try {
      const res = await masterFetch('/api/master/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPasswordInput,
          new_password: newPasswordInput,
        }),
      });
      const body = (await res.json()) as { session_token?: string; error?: string };
      if (!res.ok) {
        setBanner({ type: 'error', text: body.error || 'Не удалось сменить пароль' });
        return;
      }
      if (body.session_token) {
        setSessionToken(body.session_token);
      }
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setBanner({ type: 'success', text: 'Пароль руководителя мастерской успешно обновлён.' });
    } catch (err) {
      console.error('[MasterPanel] Ошибка при смене пароля:', err);
      setBanner({ type: 'error', text: 'Ошибка сети при смене пароля' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleUploadLegalFile = async (docKey: LegalDocKey, file: File | undefined) => {
    if (!file) return;
    setBanner(null);
    const formData = new FormData();
    formData.append('file', file);
    const res = await masterFetch(`/api/master/legal-documents/${docKey}/file`, {
      method: 'POST',
      body: formData,
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось загрузить файл документа' });
      return;
    }
    setBanner({ type: 'success', text: 'Файл документа загружен и доступен родителям в ЛК.' });
    await loadDashboard();
  };

  const handleDeleteLegalFile = async (docKey: LegalDocKey) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/legal-documents/${docKey}/file`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      setBanner({ type: 'error', text: 'Не удалось удалить файл документа' });
      return;
    }
    setBanner({ type: 'success', text: 'Загруженный файл удалён, используется текстовая версия.' });
    await loadDashboard();
  };

  const handleSaveLegalText = async (docKey: LegalDocKey) => {
    setBanner(null);
    const res = await masterFetch(`/api/master/legal-documents/${docKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: legalTitleInput, content_text: legalTextInput }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось сохранить текст документа' });
      return;
    }
    setEditingLegalKey(null);
    setBanner({ type: 'success', text: 'Текст документа обновлён.' });
    await loadDashboard();
  };

  if (authenticated === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="h-56 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_10px_28px_-16px_rgba(17,24,39,0.08)] sm:p-8"
        >
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FDF4ED] text-[#C86D2D]">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-[#111827]">
            Панель мастера «Ясна»
          </h1>
          <p className="mt-1.5 text-sm text-[#6B7280]">
            Введите пароль руководителя мастерской для управления расписанием, журналом и
            оплатами.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="master-password-input"
                className="block text-xs font-medium text-[#6B7280]"
              >
                Пароль мастера
              </label>
              <input
                id="master-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                placeholder="Введите пароль"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 text-sm text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
              />
            </div>

            {loginError && (
              <p className="text-xs font-medium text-[#991B1B]" role="alert">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="min-h-[44px] w-full cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#B05B20] disabled:opacity-60"
            >
              {loggingIn ? 'Вход...' : 'Войти в панель мастера'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const renewalCount = (data?.families ?? []).filter((f) => f.needs_renewal).length;
  const allChildrenFlat = (data?.families ?? []).flatMap((f) =>
    f.children.map((c) => ({ ...c, parent_name: f.parent_name }))
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-[#6B7280]">
            Школа труда и столярная мастерская «Ясна» · г. Сургут
          </div>
          <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-[#111827]">
            Управление мастерской
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#111827] shadow-sm hover:bg-[#F9FAFB]"
        >
          <LogOut className="h-4 w-4 text-[#6B7280]" strokeWidth={1.5} />
          Выйти
        </button>
      </div>

      {/* KPI Strip */}
      {data && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <div className="text-xs text-[#6B7280]">Занятий в базе</div>
            <div className="mt-1 font-display text-2xl font-bold text-[#111827] tabular-nums">
              {data.lessons.filter((l) => !l.is_canceled).length}
            </div>
          </div>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <div className="text-xs text-[#6B7280]">Семей / Детей</div>
            <div className="mt-1 font-display text-2xl font-bold text-[#111827] tabular-nums">
              {data.families.length} / {allChildrenFlat.length}
            </div>
          </div>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <div className="text-xs text-[#6B7280]">Нужно продлить</div>
            <div
              className={`mt-1 font-display text-2xl font-bold tabular-nums ${
                renewalCount > 0 ? 'text-[#92400E]' : 'text-[#065F46]'
              }`}
            >
              {renewalCount}
            </div>
          </div>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <div className="text-xs text-[#6B7280]">Успешных оплат</div>
            <div className="mt-1 font-display text-2xl font-bold text-[#111827] tabular-nums">
              {data.payments.filter((p) => p.status === 'succeeded').length}
            </div>
          </div>
        </div>
      )}

      {/* Banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`mt-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${
              banner.type === 'success'
                ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                : 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {banner.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="cursor-pointer text-xs underline"
            >
              Закрыть
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white p-1.5">
        {(
          [
            { id: 'schedule', label: 'Расписание и журнал', icon: Calendar },
            { id: 'grid', label: 'Журнал (клеточки)', icon: Grid3x3 },
            { id: 'families', label: 'Семьи и абонементы', icon: Users },
            { id: 'payments', label: 'Оплаты и чеки', icon: FileText },
            { id: 'settings', label: 'Документы согласий и правила', icon: Settings },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-[#C86D2D] text-white shadow-sm'
                  : 'text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="mt-6 h-64 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
      ) : (
        data && (
          <div className="mt-6">
            <AnimatePresence mode="wait">
              {/* TAB 1: SCHEDULE & ATTENDANCE */}
              {activeTab === 'schedule' && (
                <motion.div
                  key="m-schedule"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold text-[#111827]">
                      Занятия и отметки посещаемости
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-white p-1">
                        <button
                          type="button"
                          onClick={() => setScheduleViewMode('calendar')}
                          className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
                            scheduleViewMode === 'calendar'
                              ? 'bg-[#C86D2D] text-white shadow-xs'
                              : 'text-[#6B7280] hover:text-[#111827]'
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Календарь
                        </button>
                        <button
                          type="button"
                          onClick={() => setScheduleViewMode('list')}
                          className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
                            scheduleViewMode === 'list'
                              ? 'bg-[#C86D2D] text-white shadow-xs'
                              : 'text-[#6B7280] hover:text-[#111827]'
                          }`}
                        >
                          <List className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Список
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowCancelDateBox((prev) => !prev)}
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#FECACA] bg-white px-3.5 text-sm font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                      >
                        Отменить дату
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (showNewLesson) {
                            setShowNewLesson(false);
                            resetLessonForm();
                          } else {
                            resetLessonForm();
                            setShowNewLesson(true);
                          }
                        }}
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20]"
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.5} />
                        {showNewLesson ? 'Скрыть форму' : 'Новое занятие'}
                      </button>
                    </div>
                  </div>

                  {showCancelDateBox && (
                    <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2]/60 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <div className="font-display text-sm font-semibold text-[#991B1B]">
                            Отменить все занятия за выбранную дату
                          </div>
                          <p className="mt-0.5 text-xs text-[#6B7280]">
                            Все слоты за этот день будут отменены, записанным семьям придёт уведомление без списания. Остальное расписание сохранится.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={cancelDateInput}
                            onChange={(e) => setCancelDateInput(e.target.value)}
                            className="min-h-[40px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={!cancelDateInput}
                            onClick={() => void handleCancelDate(cancelDateInput)}
                            className="min-h-[40px] cursor-pointer rounded-xl bg-[#991B1B] px-4 text-xs font-semibold text-white hover:bg-[#7F1D1D] disabled:opacity-50"
                          >
                            Отменить дату
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {showNewLesson && (
                    <form
                      onSubmit={handleSaveLesson}
                      className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <h3 className="font-display text-base font-semibold text-[#111827]">
                        {editingLessonId !== null
                          ? 'Редактировать занятие'
                          : 'Добавить занятие в расписание'}
                      </h3>
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Название занятия
                          </label>
                          <input
                            type="text"
                            required
                            value={lessonTitle}
                            onChange={(e) => setLessonTitle(e.target.value)}
                            placeholder={
                              lessonType === 'masterclass'
                                ? 'Например: Полка из массива или скворечник'
                                : lessonType === 'individual'
                                  ? 'Индивидуальное занятие'
                                  : lessonType === 'birthday'
                                    ? 'День рождения в мастерской'
                                    : 'Групповое занятие'
                            }
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Формат
                          </label>
                          <select
                            value={lessonType}
                            onChange={(e) => {
                              const val = e.target.value;
                              const nextType: LessonType =
                                val === 'masterclass' || val === 'individual' || val === 'birthday'
                                  ? val
                                  : 'group';
                              setLessonType(nextType);
                              if (nextType === 'individual') {
                                setLessonCapacity(1);
                              } else if (editingLessonId === null) {
                                if (nextType === 'birthday') setLessonCapacity(8);
                                else if (nextType === 'masterclass') setLessonCapacity(6);
                                else {
                                  setLessonCapacity(defaultGroupCapacity);
                                  if (!lessonTitle.trim()) setLessonTitle('Групповое занятие');
                                }
                              }
                            }}
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          >
                            <option value="group">Группа</option>
                            <option value="masterclass">Мастер-класс</option>
                            <option value="individual">Индивидуальное</option>
                            <option value="birthday">День рождения</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Дата и время начала
                          </label>
                          <input
                            type="datetime-local"
                            required
                            value={lessonStart}
                            onChange={(e) => setLessonStart(e.target.value)}
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Вместимость (мест)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            disabled={lessonType === 'individual'}
                            value={lessonType === 'individual' ? 1 : lessonCapacity}
                            onChange={(e) => setLessonCapacity(Number(e.target.value))}
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Длительность (минут)
                          </label>
                          <input
                            type="number"
                            min={15}
                            max={240}
                            value={lessonDuration}
                            onChange={(e) => setLessonDuration(Number(e.target.value))}
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Разовая цена (₽)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={lessonPrice}
                            onChange={(e) => setLessonPrice(Number(e.target.value))}
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="block text-xs font-medium text-[#6B7280]">
                          Описание (материалы, возраст)
                        </label>
                        <input
                          type="text"
                          value={lessonDesc}
                          onChange={(e) => setLessonDesc(e.target.value)}
                          placeholder="Краткое описание для родителей"
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        {editingLessonId !== null && (
                          <button
                            type="button"
                            onClick={() => {
                              resetLessonForm();
                              setShowNewLesson(false);
                            }}
                            className="min-h-[44px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
                          >
                            Отмена редактирования
                          </button>
                        )}
                        <button
                          type="submit"
                          className="min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20]"
                        >
                          {editingLessonId !== null ? 'Сохранить изменения' : 'Создать занятие'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Calendar or Flat List */}
                  {scheduleViewMode === 'calendar' ? (
                    <ScheduleCalendarView
                      lessons={data.lessons}
                      families={data.families}
                      onMarkStatus={handleMarkStatus}
                      onEnrollChild={handleEnrollChildByIds}
                      onConvertWaitlist={handleConvertWaitlist}
                      onEditLesson={startEditLesson}
                      onCancelLesson={handleCancelLesson}
                      onCancelDate={handleCancelDate}
                      onCreateLessonOnDate={startCreateLessonOnDate}
                      onSelectStudent={openStudentCard}
                    />
                  ) : (
                    <div className="space-y-4">
                      {data.lessons.map((lesson) => {
                      const isFull = lesson.free_spots === 0;
                      return (
                        <div
                          key={lesson.id}
                          className={`rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
                            lesson.is_canceled ? 'border-[#E5E7EB] opacity-65' : 'border-[#E5E7EB]'
                          }`}
                        >
                          <div className="flex flex-col justify-between gap-3 border-b border-[#F3F4F6] pb-4 sm:flex-row sm:items-center">
                            <div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280] tabular-nums">
                                <span>{lessonTypeLabel(lesson.lesson_type)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{formatDateTimeRu(lesson.start_time)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{formatMoney(lesson.single_price)}</span>
                              </div>
                              <h3 className="mt-1 font-display text-lg font-semibold text-[#111827]">
                                {lesson.title}
                                {lesson.is_canceled === 1 && ' (Отменено)'}
                              </h3>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums ${
                                  isFull
                                    ? 'bg-[#FEF2F2] text-[#991B1B]'
                                    : 'bg-[#ECFDF5] text-[#065F46]'
                                }`}
                              >
                                Записано: {lesson.booked_count} из {lesson.capacity}
                              </span>

                              {lesson.is_canceled === 0 && (
                                <button
                                  type="button"
                                  onClick={() => startEditLesson(lesson)}
                                  className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-[#6B7280]" strokeWidth={1.5} />
                                  Редактировать
                                </button>
                              )}

                              {lesson.is_canceled === 0 &&
                                (confirmCancelLessonId === lesson.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => void handleCancelLesson(lesson.id)}
                                      className="min-h-[40px] cursor-pointer rounded-xl bg-[#991B1B] px-3 text-xs font-medium text-white"
                                    >
                                      Подтвердить отмену
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelLessonId(null)}
                                      className="min-h-[40px] cursor-pointer rounded-xl border border-[#E5E7EB] px-3 text-xs text-[#6B7280]"
                                    >
                                      Нет
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelLessonId(lesson.id)}
                                    className="min-h-[40px] cursor-pointer rounded-xl border border-[#E5E7EB] px-3 text-xs font-medium text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                                  >
                                    Отменить занятие
                                  </button>
                                ))}
                            </div>
                          </div>

                          {/* Enrolled Children */}
                          <div className="mt-4 space-y-2.5">
                            {lesson.bookings.length === 0 ? (
                              <div className="text-sm text-[#6B7280]">
                                Пока никто не записан.
                              </div>
                            ) : (
                              lesson.bookings.map((b) => (
                                <div
                                  key={b.id}
                                  className="flex flex-col justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3.5 lg:flex-row lg:items-center"
                                >
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openStudentCard(b.family_id, b.child_id)}
                                        className="cursor-pointer font-semibold text-[#111827] underline decoration-[#C86D2D]/50 underline-offset-2 hover:text-[#C86D2D]"
                                      >
                                        {b.child_name} ({pluralizeYears(b.child_age)})
                                      </button>
                                      <span
                                        className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${bookingStatusClasses(
                                          b.status
                                        )}`}
                                      >
                                        {bookingStatusLabel(b.status)}
                                      </span>
                                      {b.is_makeup === 1 && (
                                        <span className="text-xs font-medium text-[#C86D2D]">
                                          Отработка
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-0.5 text-xs text-[#6B7280] tabular-nums">
                                      {b.parent_name} · {b.phone}
                                      {b.email ? ` · ${b.email}` : ''}
                                      {b.max_contact ? ` · MAX: ${b.max_contact}` : ''} ·{' '}
                                      {b.is_charged ? 'Списано' : 'Не списано'}
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="text"
                                      value={reasonMap[b.id] ?? ''}
                                      onChange={(e) =>
                                        setReasonMap((prev) => ({
                                          ...prev,
                                          [b.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Комментарий (опц.)"
                                      className="min-h-[40px] w-40 rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs focus:border-[#C86D2D] focus:outline-none"
                                    />

                                    <button
                                      type="button"
                                      onClick={() => void handleMarkStatus(b.id, 'attended')}
                                      className={`min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-medium transition-colors ${
                                        b.status === 'attended'
                                          ? 'bg-[#065F46] text-white'
                                          : 'border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#ECFDF5] hover:text-[#065F46]'
                                      }`}
                                    >
                                      Посетил
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleMarkStatus(b.id, 'missed')}
                                      className={`min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-medium transition-colors ${
                                        b.status === 'missed'
                                          ? 'bg-[#991B1B] text-white'
                                          : 'border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#FEF2F2] hover:text-[#991B1B]'
                                      }`}
                                    >
                                      Пропустил
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleMarkStatus(b.id, 'canceled')}
                                      className={`min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-medium transition-colors ${
                                        b.status === 'canceled'
                                          ? 'bg-[#4B5563] text-white'
                                          : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F3F4F6]'
                                      }`}
                                    >
                                      Отмена
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Waitlist for this lesson */}
                          {lesson.waitlist.length > 0 && (
                            <div className="mt-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5">
                              <div className="text-xs font-semibold text-[#92400E]">
                                Лист ожидания ({lesson.waitlist.length})
                              </div>
                              <div className="mt-2 space-y-2">
                                {lesson.waitlist.map((w) => (
                                  <div
                                    key={w.id}
                                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (w.family_id) {
                                          openStudentCard(w.family_id, w.child_id);
                                        }
                                      }}
                                      className="cursor-pointer font-medium text-[#111827] underline decoration-[#C86D2D]/50 underline-offset-2 hover:text-[#C86D2D]"
                                    >
                                      {w.child_name} ({w.parent_name}, {w.phone})
                                    </button>
                                    {lesson.is_canceled === 0 && (
                                      <button
                                        type="button"
                                        onClick={() => void handleConvertWaitlist(w.id)}
                                        className="min-h-[36px] cursor-pointer rounded-lg bg-[#C86D2D] px-3 font-medium text-white hover:bg-[#B05B20]"
                                      >
                                        Перевести в группу
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Quick Manual Enroll (allowed even when group is full) */}
                          {lesson.is_canceled === 0 && (
                            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-3">
                              <select
                                value={enrollChildMap[lesson.id] ?? ''}
                                onChange={(e) =>
                                  setEnrollChildMap((prev) => ({
                                    ...prev,
                                    [lesson.id]: e.target.value,
                                  }))
                                }
                                className="min-h-[44px] flex-1 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:outline-none sm:max-w-xs"
                              >
                                <option value="">Записать ученика...</option>
                                {allChildrenFlat.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} ({c.parent_name})
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => void handleMasterEnroll(lesson.id)}
                                className="min-h-[44px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#111827] hover:bg-[#F9FAFB]"
                              >
                                {isFull ? 'Записать сверх лимита' : 'Записать'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  )}

                  {/* Attendance History Log */}
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-5 py-4">
                      <History className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                      <h3 className="font-display text-base font-semibold text-[#111827]">
                        История изменений отметок посещаемости
                      </h3>
                    </div>
                    {data.attendance_logs.length === 0 ? (
                      <div className="p-6 text-sm text-[#6B7280]">Изменений пока не было.</div>
                    ) : (
                      <div className="divide-y divide-[#F3F4F6]">
                        {data.attendance_logs.slice(0, 15).map((log) => (
                          <div
                            key={log.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-[#111827]">{log.child_name}</span>
                              <span className="text-[#6B7280]"> · {log.lesson_title} · </span>
                              <span className="font-medium text-[#6B7280]">
                                {bookingStatusLabel(log.old_status)} →{' '}
                                <span className="text-[#111827]">
                                  {bookingStatusLabel(log.new_status)}
                                </span>
                              </span>
                              {log.reason && (
                                <span className="text-[#6B7280]"> ({log.reason})</span>
                              )}
                            </div>
                            <span className="text-[#9CA3AF] tabular-nums">
                              {formatDateTimeRu(log.changed_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* TAB: SCHOOL ATTENDANCE GRID */}
              {activeTab === 'grid' && (
                <motion.div
                  key="m-grid"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                >
                  <SchoolJournalGrid
                    lessons={data.lessons}
                    families={data.families}
                    onMarkStatus={handleMarkStatus}
                    onEnrollChild={handleEnrollChildByIds}
                    onSelectStudent={openStudentCard}
                  />
                </motion.div>
              )}

              {/* TAB 2: FAMILIES & SUBSCRIPTIONS */}
              {activeTab === 'families' && (
                <motion.div
                  key="m-families"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold text-[#111827]">
                      Семьи, абонементы и персональные ссылки
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewTariff((prev) => !prev)}
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#111827] shadow-sm hover:bg-[#F9FAFB]"
                      >
                        <Ticket className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                        {showNewTariff ? 'Скрыть форму тарифа' : 'Новый тариф абонемента'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewFamily((prev) => !prev)}
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20]"
                      >
                        <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                        {showNewFamily ? 'Скрыть форму' : 'Добавить семью'}
                      </button>
                    </div>
                  </div>

                  {/* Tariffs Management Card */}
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-semibold text-[#111827]">
                          Тарифы абонементов мастерской
                        </h3>
                        <p className="mt-0.5 text-xs text-[#6B7280]">
                          Активные тарифы видны родителям на витрине и доступны для онлайн-оплаты.
                        </p>
                      </div>
                    </div>

                    {showNewTariff && (
                      <form
                        onSubmit={handleCreateTariff}
                        className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4"
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <label className="block text-xs font-medium text-[#6B7280]">
                              Название тарифа
                            </label>
                            <input
                              type="text"
                              required
                              value={tariffTitle}
                              onChange={(e) => setTariffTitle(e.target.value)}
                              placeholder="Например: Абонемент на 6 занятий"
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm focus:border-[#C86D2D] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#6B7280]">
                              Количество занятий
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              required
                              value={tariffLessonsCount}
                              onChange={(e) => setTariffLessonsCount(Number(e.target.value))}
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#6B7280]">
                              Стоимость (₽)
                            </label>
                            <input
                              type="number"
                              min={100}
                              step={50}
                              required
                              value={tariffPrice}
                              onChange={(e) => setTariffPrice(Number(e.target.value))}
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#6B7280]">
                              Срок действия (дней)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              required
                              value={tariffValidityDays}
                              onChange={(e) => setTariffValidityDays(Number(e.target.value))}
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowNewTariff(false)}
                            className="min-h-[40px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-4 text-xs font-medium text-[#6B7280]"
                          >
                            Отмена
                          </button>
                          <button
                            type="submit"
                            className="min-h-[40px] cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-xs font-medium text-white hover:bg-[#B05B20]"
                          >
                            Создать тариф
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {data.tariffs.map((t) => {
                        const active = t.is_active !== 0;
                        const isEditingThis = editingTariffId === t.id;
                        if (isEditingThis) {
                          return (
                            <form
                              key={t.id}
                              onSubmit={handleSaveTariffEdit}
                              className="rounded-xl border border-[#C86D2D] bg-[#FDF4ED]/40 p-3 space-y-2"
                            >
                              <input
                                type="text"
                                required
                                value={editTariffTitle}
                                onChange={(e) => setEditTariffTitle(e.target.value)}
                                className="min-h-[36px] w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium"
                                placeholder="Название тарифа"
                              />
                              <div className="grid grid-cols-3 gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={1000}
                                  required
                                  value={editTariffLessons}
                                  onChange={(e) => setEditTariffLessons(Number(e.target.value))}
                                  title="Занятий"
                                  className="min-h-[36px] rounded-lg border border-[#E5E7EB] bg-white px-2 text-xs tabular-nums"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  step={50}
                                  required
                                  value={editTariffPrice}
                                  onChange={(e) => setEditTariffPrice(Number(e.target.value))}
                                  title="Цена (₽)"
                                  className="min-h-[36px] rounded-lg border border-[#E5E7EB] bg-white px-2 text-xs tabular-nums"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={3650}
                                  required
                                  value={editTariffValidity}
                                  onChange={(e) => setEditTariffValidity(Number(e.target.value))}
                                  title="Дней (внутр.)"
                                  className="min-h-[36px] rounded-lg border border-[#E5E7EB] bg-white px-2 text-xs tabular-nums"
                                />
                              </div>
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingTariffId(null)}
                                  className="min-h-[32px] cursor-pointer rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#6B7280]"
                                >
                                  Отмена
                                </button>
                                <button
                                  type="submit"
                                  className="min-h-[32px] cursor-pointer rounded-lg bg-[#C86D2D] px-3 text-xs font-semibold text-white"
                                >
                                  Сохранить
                                </button>
                              </div>
                            </form>
                          );
                        }
                        return (
                          <div
                            key={t.id}
                            className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 ${
                              active
                                ? 'border-[#E5E7EB] bg-[#F9FAFB]'
                                : 'border-[#E5E7EB] bg-white opacity-60'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-[#111827]">{t.title}</div>
                              <div className="text-xs text-[#6B7280] tabular-nums">
                                {pluralizeLessons(t.lessons_count)} · {formatMoney(t.price)}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditTariff(t)}
                                className="inline-flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]"
                                title="Редактировать тариф"
                              >
                                <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleTariff(t.id)}
                                className="inline-flex min-h-[36px] shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium text-[#6B7280] hover:text-[#111827]"
                                title={active ? 'Скрыть с витрины' : 'Сделать активным'}
                              >
                                {active ? (
                                  <>
                                    <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    <span>Скрыть</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-3.5 w-3.5 text-[#065F46]" strokeWidth={1.5} />
                                    <span className="text-[#065F46]">Показать</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {showNewFamily && (
                    <form
                      onSubmit={handleCreateFamily}
                      className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <h3 className="font-display text-base font-semibold text-[#111827]">
                        Регистрация нового ученика / семьи
                      </h3>
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <input
                          type="text"
                          required
                          value={newParentName}
                          onChange={(e) => setNewParentName(e.target.value)}
                          placeholder="ФИО ученика или родителя"
                          className="min-h-[44px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <input
                          type="text"
                          required
                          value={newParentPhone}
                          onChange={(e) => setNewParentPhone(e.target.value)}
                          placeholder="+7 (922) 000-00-00"
                          className="min-h-[44px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <input
                          type="email"
                          value={newParentEmail}
                          onChange={(e) => setNewParentEmail(e.target.value)}
                          placeholder="Почта (Email)"
                          className="min-h-[44px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <input
                          type="text"
                          value={newParentMax}
                          onChange={(e) => setNewParentMax(e.target.value)}
                          placeholder="Мессенджер MAX (ник или номер)"
                          className="min-h-[44px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <input
                          type="text"
                          value={newChildName}
                          onChange={(e) => setNewChildName(e.target.value)}
                          placeholder="Имя ученика (если отличается)"
                          className="min-h-[44px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <input
                          type="number"
                          min={3}
                          max={99}
                          required
                          value={newChildAge}
                          onChange={(e) => setNewChildAge(Number(e.target.value))}
                          placeholder="Возраст"
                          className="min-h-[44px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="submit"
                          className="min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-5 text-sm font-medium text-white hover:bg-[#B05B20]"
                        >
                          Сохранить ученика
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-4">
                    {data.families.map((family) => (
                      <div
                        key={family.id}
                        className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                          <div>
                            <div className="flex flex-wrap items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => openStudentCard(family.id, family.children[0]?.id)}
                                className="cursor-pointer text-left font-display text-lg font-semibold text-[#111827] underline decoration-[#C86D2D]/40 underline-offset-2 hover:text-[#C86D2D]"
                              >
                                {family.parent_name}
                              </button>
                              {family.needs_renewal && (
                                <span className="rounded-lg bg-[#FFFBEB] px-2.5 py-0.5 text-xs font-semibold text-[#92400E]">
                                  Напомнить о продлении
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6B7280] tabular-nums">
                              <span>{family.phone}</span>
                              {family.email && <span>· Почта: {family.email}</span>}
                              {family.max_contact && <span>· MAX: {family.max_contact}</span>}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#111827]">
                              <span className="text-xs font-medium text-[#6B7280]">Ученики:</span>
                              {family.children.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => openStudentCard(family.id, c.id)}
                                  className="cursor-pointer rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-xs font-medium text-[#111827] hover:border-[#C86D2D] hover:bg-[#FDF4ED] hover:text-[#C86D2D]"
                                >
                                  {c.name}, {pluralizeYears(c.age)}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() =>
                                  setAddChildFamilyId((prev) =>
                                    prev === family.id ? null : family.id
                                  )
                                }
                                className="cursor-pointer text-xs font-medium text-[#C86D2D] hover:underline"
                              >
                                + Добавить ученика
                              </button>
                            </div>

                            {addChildFamilyId === family.id && (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={extraChildName}
                                  onChange={(e) => setExtraChildName(e.target.value)}
                                  placeholder="ФИО / Имя ученика"
                                  className="min-h-[40px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs"
                                />
                                <input
                                  type="number"
                                  min={3}
                                  max={99}
                                  value={extraChildAge}
                                  onChange={(e) => setExtraChildAge(Number(e.target.value))}
                                  className="min-h-[40px] w-20 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs tabular-nums"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleAddChildToFamily(family.id)}
                                  className="min-h-[40px] cursor-pointer rounded-xl bg-[#C86D2D] px-3 text-xs font-medium text-white"
                                >
                                  Добавить
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-3 sm:items-center">
                            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2.5">
                              <div className="text-[11px] text-[#6B7280]">Остаток занятий</div>
                              <div className="font-display text-lg font-bold text-[#111827] tabular-nums">
                                {pluralizeLessons(family.remaining_lessons)}
                              </div>
                              {family.subscriptions[0] && (
                                <div className="text-[11px] text-[#6B7280] tabular-nums">
                                  до {formatDateRu(family.subscriptions[0].expires_at)}
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2.5">
                              <div className="text-[11px] text-[#6B7280]">Денежный баланс</div>
                              <div
                                className={`font-display text-lg font-bold tabular-nums ${
                                  family.money_balance < 0
                                    ? 'text-[#991B1B]'
                                    : family.money_balance > 0
                                    ? 'text-[#065F46]'
                                    : 'text-[#111827]'
                                }`}
                              >
                                {formatMoney(family.money_balance)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {family.subscriptions.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {family.subscriptions.map((sub) => (
                              <span
                                key={sub.id}
                                className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-xs text-[#111827] tabular-nums"
                              >
                                {sub.title}: {sub.remaining_lessons} из {sub.total_lessons} зан. · до{' '}
                                {formatDateRu(sub.expires_at)}
                              </span>
                            ))}
                          </div>
                        )}

                        {addSubFamilyId === family.id && (
                          <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                            <div className="text-xs font-semibold text-[#111827]">
                              Начислить абонемент семье ({family.parent_name})
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <label className="block text-xs font-medium text-[#6B7280]">
                                  Тариф или свой вариант
                                </label>
                                <select
                                  value={subTariffChoice}
                                  onChange={(e) => setSubTariffChoice(e.target.value)}
                                  className="mt-1 min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs focus:border-[#C86D2D] focus:outline-none"
                                >
                                  {data.tariffs
                                    .filter((t) => t.is_active !== 0)
                                    .map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.title} ({t.lessons_count} зан., {t.validity_days} дн.)
                                      </option>
                                    ))}
                                  <option value="custom">Произвольный абонемент</option>
                                </select>
                              </div>

                              {subTariffChoice === 'custom' && (
                                <>
                                  <div>
                                    <label className="block text-xs font-medium text-[#6B7280]">
                                      Название
                                    </label>
                                    <input
                                      type="text"
                                      value={subCustomTitle}
                                      onChange={(e) => setSubCustomTitle(e.target.value)}
                                      placeholder="Название абонемента"
                                      className="mt-1 min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs focus:border-[#C86D2D] focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-[#6B7280]">
                                      Занятий
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={100}
                                      value={subCustomLessons}
                                      onChange={(e) => setSubCustomLessons(Number(e.target.value))}
                                      className="mt-1 min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs tabular-nums focus:border-[#C86D2D] focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-[#6B7280]">
                                      Срок (дней)
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={365}
                                      value={subCustomDays}
                                      onChange={(e) => setSubCustomDays(Number(e.target.value))}
                                      className="mt-1 min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs tabular-nums focus:border-[#C86D2D] focus:outline-none"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setAddSubFamilyId(null)}
                                className="min-h-[36px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs text-[#6B7280]"
                              >
                                Отмена
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleGrantSubscription(family.id)}
                                className="min-h-[36px] cursor-pointer rounded-xl bg-[#C86D2D] px-3.5 text-xs font-medium text-white hover:bg-[#B05B20]"
                              >
                                Добавить абонемент
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-4">
                          <button
                            type="button"
                            onClick={() => openStudentCard(family.id, family.children[0]?.id)}
                            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3.5 text-xs font-medium text-white hover:bg-[#B05B20]"
                          >
                            <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Карточка ученика
                          </button>

                          <button
                            type="button"
                            onClick={() => onNavigate(`/lk/${family.access_token}`)}
                            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                            Открыть ЛК ученика
                          </button>

                          <button
                            type="button"
                            onClick={() => openGrantSubscription(family.id)}
                            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                          >
                            <Ticket className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                            Начислить абонемент
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopyLink(family.access_token)}
                            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                          >
                            <Copy className="h-3.5 w-3.5 text-[#6B7280]" strokeWidth={1.5} />
                            Копировать ссылку
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void handleSendReminder(family.id, family.parent_name)
                            }
                            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                          >
                            <Bell className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                            Напомнить о продлении
                          </button>

                          {confirmRegenFamilyId === family.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleRegenerateToken(family.id)}
                                className="min-h-[40px] cursor-pointer rounded-xl bg-[#991B1B] px-3 text-xs font-medium text-white"
                              >
                                Отозвать старую и выпустить новую
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRegenFamilyId(null)}
                                className="min-h-[40px] cursor-pointer rounded-xl border border-[#E5E7EB] px-3 text-xs text-[#6B7280]"
                              >
                                Отмена
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRegenFamilyId(family.id)}
                              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                            >
                              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                              Перевыпустить ссылку
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* TAB 3: PAYMENTS & RECEIPTS */}
              {activeTab === 'payments' && (
                <motion.div
                  key="m-payments"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-6"
                >
                  {/* Manual Payment Form */}
                  <form
                    onSubmit={handleManualPayment}
                    className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                  >
                    <h2 className="font-display text-base font-semibold text-[#111827]">
                      Внести оплату вручную (наличные или перевод)
                    </h2>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="block text-xs font-medium text-[#6B7280]">Семья</label>
                        <select
                          value={payFamilyId}
                          onChange={(e) => setPayFamilyId(e.target.value)}
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:outline-none"
                        >
                          {data.families.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.parent_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#6B7280]">
                          Тариф или пополнение
                        </label>
                        <select
                          value={payTariffId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setPayTariffId(nextId);
                            const matched = data.tariffs.find((t) => String(t.id) === nextId);
                            if (matched) {
                              setPayTariffAmount(String(matched.price));
                            }
                          }}
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:outline-none"
                        >
                          {data.tariffs
                            .filter((t) => t.is_active !== 0)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.title} — {formatMoney(t.price)}
                              </option>
                            ))}
                          <option value="custom">Произвольная сумма / баланс</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#6B7280]">
                          Способ оплаты
                        </label>
                        <select
                          value={payMethod}
                          onChange={(e) =>
                            setPayMethod(e.target.value === 'transfer' ? 'transfer' : 'cash')
                          }
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:outline-none"
                        >
                          <option value="cash">Наличные</option>
                          <option value="transfer">Перевод на карту</option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="submit"
                          className="min-h-[44px] w-full cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20]"
                        >
                          Провести оплату
                        </button>
                      </div>
                    </div>

                    {payTariffId !== 'custom' ? (
                      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                        <div className="w-full sm:w-52">
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Итоговая сумма для клиента (₽)
                          </label>
                          <input
                            type="number"
                            min={1}
                            step={50}
                            value={payTariffAmount}
                            onChange={(e) => setPayTariffAmount(e.target.value)}
                            className="mt-1 min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold tabular-nums focus:border-[#C86D2D] focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setPayTariffAmount('5000')}
                          className={`min-h-[40px] cursor-pointer rounded-xl border px-3.5 text-xs font-semibold transition-colors ${
                            payTariffAmount === '5000'
                              ? 'border-[#C86D2D] bg-[#FDF4ED] text-[#C86D2D]'
                              : 'border-[#E5E7EB] bg-white text-[#111827] hover:border-[#C86D2D] hover:text-[#C86D2D]'
                          }`}
                        >
                          Постоянный клиент: 5000 ₽
                        </button>
                        <span className="text-xs text-[#6B7280]">
                          Можно вручную скорректировать цену тарифа для постоянного клиента.
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Сумма (₽)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={payCustomAmount}
                            onChange={(e) => setPayCustomAmount(e.target.value)}
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Количество занятий (0 — на денежный баланс)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={payCustomLessons}
                            onChange={(e) => setPayCustomLessons(e.target.value)}
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm tabular-nums"
                          />
                        </div>
                      </div>
                    )}
                  </form>

                  {/* Payments Table / Cards with "Мой налог" receipts */}
                  <div className="space-y-3">
                    {data.payments.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display text-lg font-bold text-[#111827] tabular-nums">
                                {formatMoney(p.amount)}
                              </span>
                              <span
                                className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${paymentStatusClasses(
                                  p.status
                                )}`}
                              >
                                {paymentStatusLabel(p.status)}
                              </span>
                              <span className="text-xs text-[#6B7280]">
                                {p.parent_name} · {paymentMethodLabel(p.payment_method)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-[#6B7280] tabular-nums">
                              {p.tariff_title ||
                                (p.lessons_count > 0
                                  ? pluralizeLessons(p.lessons_count)
                                  : 'Пополнение денежного баланса')}{' '}
                              · {formatDateTimeRu(p.paid_at || p.created_at)}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {p.receipt_url && isSafeReceiptUrl(p.receipt_url) && (
                              <a
                                href={p.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#ECFDF5] px-3 text-xs font-semibold text-[#065F46]"
                              >
                                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                                Ссылка на чек
                              </a>
                            )}
                            {p.has_receipt_file === 1 && (
                              <>
                                <button
                                  type="button"
                                  disabled={downloadingKey === `receipt-view-${p.id}`}
                                  onClick={() =>
                                    void handleOpenMasterReceipt(p.id, p.receipt_original_name)
                                  }
                                  className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#ECFDF5] px-3 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5] disabled:opacity-60"
                                >
                                  <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  {downloadingKey === `receipt-view-${p.id}`
                                    ? 'Открытие...'
                                    : 'Открыть чек'}
                                </button>
                                <button
                                  type="button"
                                  disabled={downloadingKey === `receipt-dl-${p.id}`}
                                  onClick={() =>
                                    void handleDownloadMasterFile(
                                      `/api/files/receipts/${p.id}`,
                                      p.receipt_original_name || `receipt_${p.id}`,
                                      `receipt-dl-${p.id}`
                                    )
                                  }
                                  className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
                                >
                                  <Download className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                                  Скачать
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {p.status === 'succeeded' && (
                          <div className="mt-4 flex flex-col gap-2 border-t border-[#F3F4F6] pt-3 sm:flex-row sm:items-center">
                            <input
                              type="url"
                              value={receiptUrlInputs[p.id] ?? p.receipt_url ?? ''}
                              onChange={(e) =>
                                setReceiptUrlInputs((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder="Вставьте ссылку на чек из «Мой налог» (https://lknpd.nalog.ru/...)"
                              className="min-h-[40px] flex-1 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void handleAttachReceiptUrl(p.id)}
                              className="min-h-[40px] shrink-0 cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                            >
                              Сохранить ссылку
                            </button>

                            <label className="inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#F9FAFB] px-3.5 text-xs font-medium text-[#111827] ring-1 ring-[#E5E7EB] hover:bg-[#F3F4F6]">
                              <Upload className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                              <span>Загрузить файл</span>
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.webp"
                                onChange={(e) => {
                                  const selected = e.target.files?.[0];
                                  e.target.value = '';
                                  void handleUploadReceiptFile(p.id, selected);
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* TAB 4: SETTINGS, LEGAL CONSENT DOCUMENTS, CSV EXPORTS & BACKUP */}
              {activeTab === 'settings' && (
                <motion.div
                  key="m-settings"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="grid grid-cols-1 gap-6 lg:grid-cols-2"
                >
                  {/* Legal Documents Management (Personal Data Consent, Privacy Policy, Offer) */}
                  <div className="rounded-2xl border border-[#C86D2D]/35 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-[#C86D2D]" strokeWidth={1.75} />
                        <h2 className="font-display text-base font-bold text-[#111827]">
                          Документы согласий (при регистрации ученика, заполнении анкеты в ЛК и оплате)
                        </h2>
                      </div>
                      <span className="rounded-lg bg-[#FDF4ED] px-2.5 py-1 text-xs font-semibold text-[#C86D2D]">
                        Обновляются на сайте мгновенно
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Здесь вы можете изменить название и полный текст каждого документа согласия или загрузить свой готовый файл (PDF, DOCX, изображение, TXT). Эти документы открываются у учеников и родителей при постановке галочки на главной странице (регистрация), в анкете ученика в ЛК и перед онлайн-оплатой.
                    </p>

                    <div className="mt-4 space-y-3">
                      {data.legal_documents.map((doc) => {
                        const isEditingThis = editingLegalKey === doc.doc_key;
                        const usageLabel =
                          doc.doc_key === 'personal_data'
                            ? 'Галочка при регистрации + анкета в ЛК + оплата'
                            : doc.doc_key === 'privacy'
                            ? 'Галочка при регистрации + анкета в ЛК + оплата'
                            : 'Галочка при регистрации + оплата абонемента в ЛК';
                        return (
                          <div
                            key={doc.doc_key}
                            className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4"
                          >
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-[#111827]">
                                    {doc.title}
                                  </span>
                                  <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-0.5 text-[11px] font-medium text-[#6B7280]">
                                    {usageLabel}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-[#6B7280]">
                                  {doc.has_file === 1 && doc.original_name
                                    ? `Прикреплён ваш файл: ${doc.original_name}`
                                    : 'Используется текстовая версия документа (можно отредактировать ниже или загрузить файл)'}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <a
                                  href={`/api/public/legal/${doc.doc_key}/file?inline=1`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                                >
                                  <Eye className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                                  Открыть
                                </a>

                                <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg bg-[#C86D2D] px-3 text-xs font-medium text-white hover:bg-[#B05B20]">
                                  <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  <span>Загрузить файл</span>
                                  <input
                                    type="file"
                                    accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
                                    onChange={(e) => {
                                      const selected = e.target.files?.[0];
                                      e.target.value = '';
                                      void handleUploadLegalFile(doc.doc_key, selected);
                                    }}
                                    className="hidden"
                                  />
                                </label>

                                {doc.has_file === 1 && (
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteLegalFile(doc.doc_key)}
                                    className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border border-[#FECACA] bg-white px-3 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    Убрать файл
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditingThis) {
                                      setEditingLegalKey(null);
                                    } else {
                                      setEditingLegalKey(doc.doc_key);
                                      setLegalTitleInput(doc.title);
                                      setLegalTextInput(doc.content_text);
                                    }
                                  }}
                                  className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-[#6B7280]" strokeWidth={1.5} />
                                  {isEditingThis ? 'Свернуть редактор' : 'Изменить текст / название'}
                                </button>
                              </div>
                            </div>

                            {isEditingThis && (
                              <div className="mt-3 space-y-2.5 border-t border-[#E5E7EB] pt-3">
                                <div>
                                  <label className="block text-xs font-medium text-[#6B7280]">
                                    Название документа (отображается в ссылке рядом с галочкой)
                                  </label>
                                  <input
                                    type="text"
                                    value={legalTitleInput}
                                    onChange={(e) => setLegalTitleInput(e.target.value)}
                                    placeholder="Заголовок документа"
                                    className="mt-1 min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] focus:border-[#C86D2D] focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-[#6B7280]">
                                    Полный текст документа согласия
                                  </label>
                                  <textarea
                                    rows={8}
                                    value={legalTextInput}
                                    onChange={(e) => setLegalTextInput(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-xs leading-relaxed text-[#111827] focus:border-[#C86D2D] focus:outline-none"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingLegalKey(null)}
                                    className="min-h-[38px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#6B7280]"
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveLegalText(doc.doc_key)}
                                    className="min-h-[38px] cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-xs font-semibold text-white hover:bg-[#B05B20]"
                                  >
                                    Сохранить документ
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Configurable Rules */}
                  <form
                    onSubmit={handleSaveSettings}
                    className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                  >
                    <h2 className="font-display text-base font-semibold text-[#111827]">
                      Правила отмен, пропусков и списаний
                    </h2>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Изменения применяются сразу ко всем новым отменам и отметкам в журнале.
                    </p>

                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-[#6B7280]">
                          Бесплатная отмена возможна не позднее чем за (часов):
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={168}
                          value={freeCancelHours}
                          onChange={(e) => setFreeCancelHours(Number(e.target.value))}
                          className="mt-1 min-h-[44px] w-36 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm tabular-nums focus:border-[#C86D2D] focus:outline-none"
                        />
                      </div>

                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-[#111827]">
                        <input
                          type="checkbox"
                          checked={chargeOnMiss}
                          onChange={(e) => setChargeOnMiss(e.target.checked)}
                          className="h-4 w-4 accent-[#C86D2D]"
                        />
                        <span>Списывать занятие при отметке «Пропустил»</span>
                      </label>

                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-[#111827]">
                        <input
                          type="checkbox"
                          checked={chargeOnLateCancel}
                          onChange={(e) => setChargeOnLateCancel(e.target.checked)}
                          className="h-4 w-4 accent-[#C86D2D]"
                        />
                        <span>Списывать занятие при поздней отмене родителем</span>
                      </label>

                      <div className="border-t border-[#F3F4F6] pt-4">
                        <div className="text-sm font-semibold text-[#111827]">
                          Вместимость групп по умолчанию
                        </div>
                        <p className="mt-0.5 text-xs text-[#6B7280]">
                          Используется при создании новых групповых занятий и при массовом обновлении будущих слотов.
                        </p>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={defaultGroupCapacity}
                              onChange={(e) => setDefaultGroupCapacity(Number(e.target.value))}
                              className="min-h-[42px] w-24 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm font-semibold tabular-nums focus:border-[#C86D2D] focus:outline-none"
                            />
                            <span className="text-sm text-[#374151]">мест в группе</span>
                          </div>
                          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#374151]">
                            <input
                              type="checkbox"
                              checked={applyCapacityToUpcoming}
                              onChange={(e) => setApplyCapacityToUpcoming(e.target.checked)}
                              className="h-4 w-4 accent-[#C86D2D]"
                            />
                            <span>Применить эту вместимость ко всем будущим групповым занятиям</span>
                          </label>
                        </div>
                      </div>

                      <div className="border-t border-[#F3F4F6] pt-4">
                        <div className="text-sm font-semibold text-[#111827]">
                          Карточки на главной странице
                        </div>
                        <p className="mt-0.5 text-xs text-[#6B7280]">
                          Любую карточку можно отключить или изменить её текст.
                        </p>

                        <div className="mt-3 space-y-3">
                          <div className="flex flex-col gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 sm:flex-row sm:items-center sm:justify-between">
                            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-[#111827]">
                              <input
                                type="checkbox"
                                checked={showHeroAge}
                                onChange={(e) => setShowHeroAge(e.target.checked)}
                                className="h-4 w-4 accent-[#C86D2D]"
                              />
                              <span>Возраст</span>
                            </label>
                            <input
                              type="text"
                              maxLength={40}
                              required
                              disabled={!showHeroAge}
                              value={heroAgeText}
                              onChange={(e) => setHeroAgeText(e.target.value)}
                              placeholder="От 6 лет"
                              className="min-h-[38px] w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] sm:w-44"
                            />
                          </div>

                          <div className="flex flex-col gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 sm:flex-row sm:items-center sm:justify-between">
                            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-[#111827]">
                              <input
                                type="checkbox"
                                checked={showHeroDuration}
                                onChange={(e) => setShowHeroDuration(e.target.checked)}
                                className="h-4 w-4 accent-[#C86D2D]"
                              />
                              <span>Длительность</span>
                            </label>
                            <input
                              type="text"
                              maxLength={40}
                              required
                              disabled={!showHeroDuration}
                              value={heroDurationText}
                              onChange={(e) => setHeroDurationText(e.target.value)}
                              placeholder="2 часа"
                              className="min-h-[38px] w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] sm:w-44"
                            />
                          </div>

                          <div className="flex flex-col gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 sm:flex-row sm:items-center sm:justify-between">
                            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-[#111827]">
                              <input
                                type="checkbox"
                                checked={showHeroGroups}
                                onChange={(e) => setShowHeroGroups(e.target.checked)}
                                className="h-4 w-4 accent-[#C86D2D]"
                              />
                              <span>Группы</span>
                            </label>
                            <input
                              type="text"
                              maxLength={40}
                              required
                              disabled={!showHeroGroups}
                              value={heroGroupsText}
                              onChange={(e) => setHeroGroupsText(e.target.value)}
                              placeholder="до 4 мест"
                              className="min-h-[38px] w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] sm:w-44"
                            />
                          </div>

                          <div className="flex flex-col gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 sm:flex-row sm:items-center sm:justify-between">
                            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-[#111827]">
                              <input
                                type="checkbox"
                                checked={showHeroFreeCancel}
                                onChange={(e) => setShowHeroFreeCancel(e.target.checked)}
                                className="h-4 w-4 accent-[#C86D2D]"
                              />
                              <span>Отмена без списания</span>
                            </label>
                            <span className="text-xs font-medium text-[#6B7280] tabular-nums">
                              показывает: «за {freeCancelHours} ч»
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20]"
                      >
                        Сохранить настройки
                      </button>
                    </div>
                  </form>

                  {/* CSV Exports & SQLite Backup */}
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <h2 className="font-display text-base font-semibold text-[#111827]">
                        Выгрузка отчётов в CSV (для Excel)
                      </h2>
                      <p className="mt-1 text-xs text-[#6B7280]">
                        Кодировка UTF-8 BOM, разделитель «;» — открывается в Excel без сбоев
                        кириллицы.
                      </p>

                      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <button
                          type="button"
                          disabled={downloadingKey === 'export-clients'}
                          onClick={() =>
                            void handleDownloadMasterFile(
                              '/api/master/export/clients',
                              'yasna-clients.csv',
                              'export-clients'
                            )
                          }
                          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-60"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                          Клиенты
                        </button>
                        <button
                          type="button"
                          disabled={downloadingKey === 'export-attendance'}
                          onClick={() =>
                            void handleDownloadMasterFile(
                              '/api/master/export/attendance',
                              'yasna-attendance.csv',
                              'export-attendance'
                            )
                          }
                          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-60"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                          Посещения
                        </button>
                        <button
                          type="button"
                          disabled={downloadingKey === 'export-payments'}
                          onClick={() =>
                            void handleDownloadMasterFile(
                              '/api/master/export/payments',
                              'yasna-payments.csv',
                              'export-payments'
                            )
                          }
                          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-60"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                          Оплаты
                        </button>
                      </div>

                      <div className="mt-5 border-t border-[#F3F4F6] pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#111827]">
                              Резервная копия базы данных (SQLite)
                            </div>
                            <div className="text-xs text-[#6B7280] tabular-nums">
                              Файл yasna.db · {(data.db_size_bytes / 1024).toFixed(1)} КБ
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={downloadingKey === 'db-backup'}
                            onClick={() =>
                              void handleDownloadMasterFile(
                                '/api/master/backup',
                                `yasna-backup-${new Date().toISOString().slice(0, 10)}.db`,
                                'db-backup'
                              )
                            }
                            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#111827] px-4 text-xs font-medium text-white hover:bg-[#1F2937] disabled:opacity-60"
                          >
                            <Database className="h-4 w-4" strokeWidth={1.5} />
                            {downloadingKey === 'db-backup'
                              ? 'Выгрузка...'
                              : 'Скачать бэкап БД'}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-[#F3F4F6] pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#111827]">
                              Документация проекта (PDF)
                            </div>
                            <div className="text-xs text-[#6B7280]">
                              Установка, бэкапы, ЮKassa, список функций и ограничений
                            </div>
                          </div>
                          <a
                            href="/api/public/guide-pdf"
                            download="yasna-documentation-v1.pdf"
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                          >
                            <Download className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                            Скачать PDF-инструкцию
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Change Master Password */}
                    <form
                      onSubmit={handleChangePassword}
                      className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <h3 className="font-display text-base font-semibold text-[#111827]">
                        Смена пароля мастера
                      </h3>
                      <p className="mt-1 text-xs text-[#6B7280]">
                        Новый пароль сохраняется в зашифрованном виде (bcrypt) в базе данных.
                      </p>
                      <div className="mt-4 space-y-3">
                        <input
                          type="password"
                          required
                          value={currentPasswordInput}
                          onChange={(e) => setCurrentPasswordInput(e.target.value)}
                          placeholder="Текущий пароль"
                          className="min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={newPasswordInput}
                          onChange={(e) => setNewPasswordInput(e.target.value)}
                          placeholder="Новый пароль (от 6 символов)"
                          className="min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={confirmPasswordInput}
                          onChange={(e) => setConfirmPasswordInput(e.target.value)}
                          placeholder="Повторите новый пароль"
                          className="min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={changingPassword}
                          className="min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20] disabled:opacity-60"
                        >
                          {changingPassword ? 'Сохранение...' : 'Обновить пароль'}
                        </button>
                      </div>
                    </form>

                    {/* Broadcast Test Notification to All Families */}
                    <form
                      onSubmit={handleBroadcastNotification}
                      className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <div className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.75} />
                        <h3 className="font-display text-base font-semibold text-[#111827]">
                          Тестовое уведомление всем семьям
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-[#6B7280]">
                        Отправит уведомление в личный кабинет каждой семьи ({data.families.length})
                        и push на все подключённые телефоны и компьютеры.
                      </p>
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Заголовок
                          </label>
                          <input
                            type="text"
                            maxLength={120}
                            value={broadcastTitle}
                            onChange={(e) => setBroadcastTitle(e.target.value)}
                            className="mt-1 min-h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6B7280]">
                            Текст уведомления
                          </label>
                          <textarea
                            rows={2}
                            maxLength={1000}
                            value={broadcastMessage}
                            onChange={(e) => setBroadcastMessage(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={sendingBroadcast}
                          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#C86D2D] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20] disabled:opacity-60"
                        >
                          <BellRing className="h-4 w-4" strokeWidth={1.75} />
                          <span>
                            {sendingBroadcast
                              ? 'Отправка...'
                              : 'Отправить тестовое уведомление всем'}
                          </span>
                        </button>
                      </div>
                    </form>

                    {/* MoyKlass Table Import */}
                    <form
                      onSubmit={handleImportCsv}
                      className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.75} />
                            <h3 className="font-display text-base font-semibold text-[#111827]">
                              Импорт учеников из «МойКласс» (формат таблицы)
                            </h3>
                          </div>
                          <p className="mt-1 text-xs text-[#6B7280]">
                            Заполните строки прямо в таблице, загрузите файл выгрузки CSV/TSV из
                            «МойКласс» или вставьте скопированные ячейки из Excel / таблицы «МойКласс».
                          </p>
                        </div>

                        <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]">
                          <Upload className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
                          <span>Загрузить файл таблицы (.csv / .tsv)</span>
                          <input
                            type="file"
                            accept=".csv,.tsv,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => {
                                const text = String(reader.result ?? '');
                                setCsvImportText(text);
                                parseTableTextIntoRows(text);
                              };
                              reader.readAsText(file, 'utf-8');
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>

                      {/* Paste from Excel / MoyKlass helper */}
                      <div className="mt-3">
                        <textarea
                          rows={2}
                          value={csvImportText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCsvImportText(val);
                            if (val.includes('\t') || val.includes(';') || val.includes('\n')) {
                              parseTableTextIntoRows(val);
                            }
                          }}
                          placeholder="Вставьте сюда скопированные строки из таблицы «МойКласс» или Excel (ФИО, Телефон, Почта, MAX, Возраст / Дата рождения, Остаток) — они автоматически разложатся по колонкам ниже..."
                          className="w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-2.5 text-xs text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Interactive Table */}
                      <div className="mt-3 overflow-x-auto rounded-xl border border-[#E5E7EB]">
                        <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-semibold text-[#374151]">
                              <th className="px-2.5 py-2">ФИО ученика *</th>
                              <th className="px-2.5 py-2">Телефон</th>
                              <th className="px-2.5 py-2">Почта (Email)</th>
                              <th className="px-2.5 py-2">Мессенджер MAX</th>
                              <th className="w-28 px-2.5 py-2">Возраст / ДР</th>
                              <th className="px-2.5 py-2">Родитель (опц.)</th>
                              <th className="w-20 px-2.5 py-2">Занятий</th>
                              <th className="w-9 px-2 py-2 text-center" aria-label="Удалить" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F3F4F6] bg-white">
                            {moyKlassRows.map((row, idx) => (
                              <tr key={idx}>
                                <td className="p-1.5">
                                  <input
                                    type="text"
                                    value={row.child_name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setMoyKlassRows((prev) =>
                                        prev.map((r, i) =>
                                          i === idx ? { ...r, child_name: val } : r
                                        )
                                      );
                                    }}
                                    placeholder="Иван Петров"
                                    className="min-h-[36px] w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 text-xs focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                                  />
                                </td>
                                <td className="p-1.5">
                                  <input
                                    type="text"
                                    value={row.phone}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setMoyKlassRows((prev) =>
                                        prev.map((r, i) => (i === idx ? { ...r, phone: val } : r))
                                      );
                                    }}
                                    placeholder="+7 (922) 000-00-00"
                                    className="min-h-[36px] w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 text-xs focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                                  />
                                </td>
                                <td className="p-1.5">
                                  <input
                                    type="text"
                                    value={row.email}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setMoyKlassRows((prev) =>
                                        prev.map((r, i) => (i === idx ? { ...r, email: val } : r))
                                      );
                                    }}
                                    placeholder="mail@example.ru"
                                    className="min-h-[36px] w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 text-xs focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                                  />
                                </td>
                                <td className="p-1.5">
                                  <input
                                    type="text"
                                    value={row.max_contact}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setMoyKlassRows((prev) =>
                                        prev.map((r, i) =>
                                          i === idx ? { ...r, max_contact: val } : r
                                        )
                                      );
                                    }}
                                    placeholder="@max_nick"
                                    className="min-h-[36px] w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 text-xs focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                                  />
                                </td>
                                <td className="p-1.5">
                                  <input
                                    type="text"
                                    value={row.age}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setMoyKlassRows((prev) =>
                                        prev.map((r, i) => (i === idx ? { ...r, age: val } : r))
                                      );
                                    }}
                                    placeholder="10 или 15.05.2016"
                                    className="min-h-[36px] w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2 text-xs tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                                  />
                                </td>
                                <td className="p-1.5">
                                  <input
                                    type="text"
                                    value={row.parent_name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setMoyKlassRows((prev) =>
                                        prev.map((r, i) =>
                                          i === idx ? { ...r, parent_name: val } : r
                                        )
                                      );
                                    }}
                                    placeholder="ФИО родителя"
                                    className="min-h-[36px] w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 text-xs focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                                  />
                                </td>
                                <td className="p-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={row.remaining_lessons}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setMoyKlassRows((prev) =>
                                        prev.map((r, i) =>
                                          i === idx ? { ...r, remaining_lessons: val } : r
                                        )
                                      );
                                    }}
                                    className="min-h-[36px] w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2 text-xs tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                                  />
                                </td>
                                <td className="p-1.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMoyKlassRows((prev) =>
                                        prev.length > 1
                                          ? prev.filter((_, i) => i !== idx)
                                          : [
                                              {
                                                child_name: '',
                                                phone: '',
                                                email: '',
                                                max_contact: '',
                                                age: '10',
                                                parent_name: '',
                                                remaining_lessons: '0',
                                              },
                                            ]
                                      )
                                    }
                                    aria-label="Удалить строку"
                                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setMoyKlassRows((prev) => [
                              ...prev,
                              {
                                child_name: '',
                                phone: '',
                                email: '',
                                max_contact: '',
                                age: '10',
                                parent_name: '',
                                remaining_lessons: '0',
                              },
                            ])
                          }
                          className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                        >
                          <Plus className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={2} />
                          Добавить строку
                        </button>

                        <button
                          type="submit"
                          className="inline-flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#B05B20]"
                        >
                          <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} />
                          Импортировать таблицу в базу
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Parent Reviews Moderation */}
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:col-span-2">
                    <h3 className="font-display text-base font-semibold text-[#111827]">
                      Модерация отзывов родителей ({data.reviews.length})
                    </h3>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Родители могут оставлять отзывы в личном кабинете. Вы можете скрывать или
                      удалять публикации.
                    </p>

                    {data.reviews.length === 0 ? (
                      <div className="mt-4 text-sm text-[#6B7280]">Отзывов пока нет.</div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {data.reviews.map((rev) => (
                          <div
                            key={rev.id}
                            className={`flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-start ${
                              rev.is_published === 1
                                ? 'border-[#E5E7EB] bg-[#F9FAFB]'
                                : 'border-[#E5E7EB] bg-white opacity-60'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-[#111827]">
                                  {rev.author_name}
                                </span>
                                {rev.child_info && (
                                  <span className="text-xs text-[#6B7280]">
                                    ({rev.child_info})
                                  </span>
                                )}
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      className={`h-3.5 w-3.5 ${
                                        s <= rev.rating
                                          ? 'fill-[#C86D2D] text-[#C86D2D]'
                                          : 'text-[#D1D5DB]'
                                      }`}
                                      strokeWidth={1.5}
                                    />
                                  ))}
                                </div>
                                <span className="text-xs text-[#9CA3AF] tabular-nums">
                                  {formatDateRu(rev.created_at)}
                                </span>
                              </div>
                              <p className="text-sm leading-relaxed text-[#374151]">{rev.text}</p>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleToggleReview(rev.id)}
                                className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                              >
                                {rev.is_published === 1 ? (
                                  <>
                                    <EyeOff className="h-3.5 w-3.5 text-[#6B7280]" strokeWidth={1.5} />
                                    <span>Скрыть</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-3.5 w-3.5 text-[#065F46]" strokeWidth={1.5} />
                                    <span className="text-[#065F46]">Опубликовать</span>
                                  </>
                                )}
                              </button>

                              {confirmDeleteReviewId === rev.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteReview(rev.id)}
                                    className="min-h-[36px] cursor-pointer rounded-lg bg-[#991B1B] px-2.5 text-xs font-medium text-white"
                                  >
                                    Удалить
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteReviewId(null)}
                                    className="min-h-[36px] cursor-pointer rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#6B7280]"
                                  >
                                    Нет
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteReviewId(rev.id)}
                                  className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                                  title="Удалить отзыв"
                                >
                                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      )}

      {/* Receipt File Preview Modal */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр чека"
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#6B7280]">Чек из «Мой налог»</div>
                <div className="truncate font-display text-sm font-semibold text-[#111827]">
                  {previewReceipt.name}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={previewReceipt.blobUrl.startsWith('blob:') ? previewReceipt.blobUrl : '#'}
                  download={previewReceipt.name}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3 text-xs font-medium text-white hover:bg-[#B05B20]"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Скачать
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewReceipt(null)}
                  aria-label="Закрыть просмотр чека"
                  className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[#F9FAFB] p-4">
              {previewReceipt.isPdf ? (
                <iframe
                  src={previewReceipt.blobUrl}
                  title={previewReceipt.name}
                  className="h-[68vh] w-full rounded-xl border border-[#E5E7EB] bg-white"
                />
              ) : (
                <div className="flex items-center justify-center">
                  <img
                    src={previewReceipt.blobUrl}
                    alt={previewReceipt.name}
                    className="max-h-[70vh] w-auto rounded-xl border border-[#E5E7EB] bg-white object-contain shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Карточка ученика (Student Profile & Login Link Modal) */}
      {selectedStudentCard &&
        (() => {
          const selectedFamily = data?.families.find(
            (f) => f.id === selectedStudentCard.familyId
          );
          if (!selectedFamily) return null;
          const personalLink = `${window.location.origin}/lk/${selectedFamily.access_token}`;

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Карточка ученика"
            >
              <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-4">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#C86D2D]">
                      Карточка ученика «Ясна»
                    </div>
                    <h3 className="truncate font-display text-lg font-bold text-[#111827]">
                      {cardChildName || selectedFamily.parent_name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentCard(null)}
                    aria-label="Закрыть карточку ученика"
                    className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  {/* Personal Login Link Box */}
                  <div className="rounded-xl border border-[#F3E2D3] bg-[#FDF4ED] p-4">
                    <div className="text-xs font-semibold text-[#C86D2D]">
                      Ссылка для входа в личный кабинет ученика
                    </div>
                    <div className="mt-1.5 break-all rounded-lg border border-[#F3E2D3] bg-white px-3 py-2 font-mono text-xs text-[#111827] select-all">
                      {personalLink}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(selectedFamily.access_token)}
                        className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3.5 text-xs font-semibold text-white hover:bg-[#B05B20]"
                      >
                        <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Скопировать ссылку
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudentCard(null);
                          onNavigate(`/lk/${selectedFamily.access_token}`);
                        }}
                        className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-semibold text-[#111827] hover:bg-[#F9FAFB]"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
                        Открыть ЛК ученика
                      </button>
                    </div>
                  </div>

                  {/* Quick Switch Between Students in Family (if multiple) */}
                  {selectedFamily.children.length > 1 && (
                    <div>
                      <div className="text-xs font-medium text-[#6B7280]">
                        Ученики в этом кабинете:
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {selectedFamily.children.map((ch) => (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => {
                              setCardChildId(ch.id);
                              setCardChildName(ch.name);
                              setCardChildAge(ch.age);
                            }}
                            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              cardChildId === ch.id
                                ? 'border-[#C86D2D] bg-[#C86D2D] text-white'
                                : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] hover:bg-[#F3F4F6]'
                            }`}
                          >
                            {ch.name} ({pluralizeYears(ch.age)})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Student Details Summary Pills */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                      <div className="text-[11px] text-[#6B7280]">Возраст</div>
                      <div className="mt-0.5 font-display text-sm font-bold text-[#111827]">
                        {pluralizeYears(cardChildAge)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                      <div className="text-[11px] text-[#6B7280]">Мессенджер MAX</div>
                      <div className="mt-0.5 truncate font-display text-sm font-bold text-[#111827]">
                        {cardMax || 'Не указан'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                      <div className="text-[11px] text-[#6B7280]">Почта (Email)</div>
                      <div className="mt-0.5 truncate font-display text-sm font-bold text-[#111827]">
                        {cardEmail || 'Не указана'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                      <div className="text-[11px] text-[#6B7280]">Остаток занятий</div>
                      <div className="mt-0.5 font-display text-sm font-bold text-[#C86D2D]">
                        {pluralizeLessons(selectedFamily.remaining_lessons)}
                      </div>
                    </div>
                  </div>

                  {/* Editable Student Card Form */}
                  <form onSubmit={handleSaveStudentCard} className="space-y-4">
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="card-child-name"
                          className="block text-xs font-medium text-[#374151]"
                        >
                          ФИО ученика
                        </label>
                        <input
                          id="card-child-name"
                          type="text"
                          required
                          value={cardChildName}
                          onChange={(e) => setCardChildName(e.target.value)}
                          placeholder="ФИО ученика"
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="card-child-age"
                          className="block text-xs font-medium text-[#374151]"
                        >
                          Возраст (лет)
                        </label>
                        <input
                          id="card-child-age"
                          type="number"
                          min={3}
                          max={99}
                          required
                          value={cardChildAge}
                          onChange={(e) => setCardChildAge(Number(e.target.value))}
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] tabular-nums focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="card-parent-phone"
                          className="block text-xs font-medium text-[#374151]"
                        >
                          Номер телефона
                        </label>
                        <input
                          id="card-parent-phone"
                          type="tel"
                          required
                          value={cardPhone}
                          onChange={(e) => setCardPhone(e.target.value)}
                          placeholder="+7 (922) 000-00-00"
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="card-parent-email"
                          className="block text-xs font-medium text-[#374151]"
                        >
                          Почта (Email)
                        </label>
                        <input
                          id="card-parent-email"
                          type="email"
                          value={cardEmail}
                          onChange={(e) => setCardEmail(e.target.value)}
                          placeholder="student@example.ru"
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="card-parent-max"
                          className="block text-xs font-medium text-[#374151]"
                        >
                          Мессенджер MAX
                        </label>
                        <input
                          id="card-parent-max"
                          type="text"
                          value={cardMax}
                          onChange={(e) => setCardMax(e.target.value)}
                          placeholder="@username или номер в MAX"
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="card-parent-name"
                          className="block text-xs font-medium text-[#374151]"
                        >
                          Контактное лицо / родитель
                        </label>
                        <input
                          id="card-parent-name"
                          type="text"
                          required
                          value={cardParentName}
                          onChange={(e) => setCardParentName(e.target.value)}
                          placeholder="ФИО"
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#F3F4F6] pt-4">
                      <button
                        type="button"
                        onClick={() => setSelectedStudentCard(null)}
                        className="min-h-[42px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-4 text-xs font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
                      >
                        Закрыть
                      </button>
                      <button
                        type="submit"
                        disabled={savingStudentCard}
                        className="min-h-[42px] cursor-pointer rounded-xl bg-[#C86D2D] px-5 text-xs font-semibold text-white hover:bg-[#B05B20] disabled:opacity-50"
                      >
                        {savingStudentCard ? 'Сохранение...' : 'Сохранить карточку'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};
