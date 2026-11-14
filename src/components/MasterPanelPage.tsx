import {
  AlertCircle,
  Bell,
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
  History,
  Lock,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Star,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useState } from 'react';
import type { BookingStatus, MasterDashboardData, MasterLesson } from '../types.ts';
import {
  bookingStatusClasses,
  bookingStatusLabel,
  formatDateRu,
  formatDateTimeRu,
  formatMoney,
  paymentMethodLabel,
  paymentStatusClasses,
  paymentStatusLabel,
  pluralizeLessons,
  pluralizeYears,
} from '../utils/format.ts';

interface MasterPanelPageProps {
  onNavigate: (path: string) => void;
}

type MasterTab = 'schedule' | 'families' | 'payments' | 'settings';

const MASTER_SESSION_STORAGE_KEY = 'yasna_master_session_token';

function readStoredMasterSession(): string | null {
  try {
    return sessionStorage.getItem(MASTER_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredMasterSession(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(MASTER_SESSION_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(MASTER_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

function defaultTomorrowDatetimeLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(15, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDatetimeLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return defaultTomorrowDatetimeLocal();
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const MasterPanelPage: React.FC<MasterPanelPageProps> = ({ onNavigate }) => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [data, setData] = useState<MasterDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<MasterTab>('schedule');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create / edit lesson state
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonType, setLessonType] = useState<'group' | 'individual'>('group');
  const [lessonStart, setLessonStart] = useState(defaultTomorrowDatetimeLocal);
  const [lessonDuration, setLessonDuration] = useState(90);
  const [lessonCapacity, setLessonCapacity] = useState(2);
  const [lessonPrice, setLessonPrice] = useState(1200);
  const [lessonDesc, setLessonDesc] = useState('');

  // Quick enroll per lesson
  const [enrollChildMap, setEnrollChildMap] = useState<Record<number, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<number, string>>({});
  const [confirmCancelLessonId, setConfirmCancelLessonId] = useState<number | null>(null);

  // New family, child & tariffs / subscriptions state
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [newParentName, setNewParentName] = useState('');
  const [newParentPhone, setNewParentPhone] = useState('');
  const [newChildName, setNewChildName] = useState('');
  const [newChildAge, setNewChildAge] = useState(8);

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

  const [addSubFamilyId, setAddSubFamilyId] = useState<number | null>(null);
  const [subTariffChoice, setSubTariffChoice] = useState<string>('custom');
  const [subCustomTitle, setSubCustomTitle] = useState('Абонемент на 4 занятия');
  const [subCustomLessons, setSubCustomLessons] = useState(4);
  const [subCustomDays, setSubCustomDays] = useState(45);

  // Manual payment state
  const [payFamilyId, setPayFamilyId] = useState<string>('');
  const [payTariffId, setPayTariffId] = useState<string>('');
  const [payCustomAmount, setPayCustomAmount] = useState('1200');
  const [payCustomLessons, setPayCustomLessons] = useState('0');
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer'>('cash');

  // Receipts state
  const [receiptUrlInputs, setReceiptUrlInputs] = useState<Record<number, string>>({});

  // Settings & CSV import state
  const [freeCancelHours, setFreeCancelHours] = useState(24);
  const [chargeOnMiss, setChargeOnMiss] = useState(true);
  const [chargeOnLateCancel, setChargeOnLateCancel] = useState(true);
  const [csvImportText, setCsvImportText] = useState('');

  // Password change state
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [sessionToken, setSessionToken] = useState<string | null>(readStoredMasterSession);

  const masterFetch = useCallback(
    (input: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const activeToken = sessionToken ?? readStoredMasterSession();
      if (activeToken) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }
      return fetch(input, {
        ...init,
        headers,
        credentials: 'same-origin',
      });
    },
    [sessionToken]
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await masterFetch('/api/master/dashboard');
      if (res.status === 401) {
        writeStoredMasterSession(null);
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

      if (json.families.length > 0 && !payFamilyId) {
        setPayFamilyId(String(json.families[0].id));
      }
      const firstActiveTariff = json.tariffs.find((t) => t.is_active !== 0) ?? json.tariffs[0];
      if (firstActiveTariff && !payTariffId) {
        setPayTariffId(String(firstActiveTariff.id));
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
          writeStoredMasterSession(null);
          setSessionToken(null);
        }
      } catch {
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
        writeStoredMasterSession(body.session_token);
        setSessionToken(body.session_token);
      }
      setPassword('');
      setAuthenticated(true);
      await loadDashboard();
    } catch {
      setLoginError('Ошибка входа. Проверьте соединение.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await masterFetch('/api/master/logout', { method: 'POST' });
    writeStoredMasterSession(null);
    setSessionToken(null);
    setAuthenticated(false);
    setData(null);
  };

  const resetLessonForm = () => {
    setEditingLessonId(null);
    setLessonTitle('');
    setLessonType('group');
    setLessonStart(defaultTomorrowDatetimeLocal());
    setLessonDuration(90);
    setLessonCapacity(2);
    setLessonPrice(1200);
    setLessonDesc('');
  };

  const startEditLesson = (lesson: MasterLesson) => {
    setBanner(null);
    setEditingLessonId(lesson.id);
    setLessonTitle(lesson.title);
    setLessonType(lesson.lesson_type);
    setLessonStart(formatDatetimeLocalInput(lesson.start_time));
    setLessonDuration(lesson.duration_minutes);
    setLessonCapacity(lesson.capacity);
    setLessonPrice(lesson.single_price);
    setLessonDesc(lesson.description ?? '');
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
        start_time: new Date(lessonStart).toISOString(),
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

  const handleMasterEnroll = async (lessonId: number) => {
    const childId = Number(enrollChildMap[lessonId]);
    if (!childId) {
      setBanner({ type: 'error', text: 'Выберите ребёнка для записи' });
      return;
    }
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

  const handleMarkStatus = async (bookingId: number, status: BookingStatus) => {
    setBanner(null);
    const reason = reasonMap[bookingId]?.trim();
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

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const res = await masterFetch('/api/master/families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_name: newParentName,
        phone: newParentPhone,
        child_name: newChildName,
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
    setNewChildName('');
    setShowNewFamily(false);
    setBanner({ type: 'success', text: 'Семья добавлена, персональная ссылка сгенерирована.' });
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
    const fullUrl = `${window.location.origin}/lk/${token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setBanner({ type: 'success', text: `Ссылка скопирована: /lk/${token}` });
    } catch {
      setBanner({ type: 'success', text: `Персональная ссылка: ${fullUrl}` });
    }
  };

  const handleManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
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
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Не удалось сохранить настройки' });
      return;
    }
    setBanner({ type: 'success', text: 'Правила отмен и списаний обновлены.' });
    await loadDashboard();
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const res = await masterFetch('/api/master/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_text: csvImportText }),
    });
    const body = (await res.json()) as {
      importedFamilies?: number;
      importedChildren?: number;
      error?: string;
    };
    if (!res.ok) {
      setBanner({ type: 'error', text: body.error || 'Ошибка импорта CSV' });
      return;
    }
    setCsvImportText('');
    setBanner({
      type: 'success',
      text: `Импортировано семей: ${body.importedFamilies ?? 0}, детей: ${body.importedChildren ?? 0}.`,
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
        writeStoredMasterSession(body.session_token);
        setSessionToken(body.session_token);
      }
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setBanner({ type: 'success', text: 'Пароль руководителя мастерской успешно обновлён.' });
    } catch {
      setBanner({ type: 'error', text: 'Ошибка сети при смене пароля' });
    } finally {
      setChangingPassword(false);
    }
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FDF4ED] text-[#C86D2D]">
            <Lock className="h-5 w-5" strokeWidth={1.5} />
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
            Столярная мастерская «Ясна» · г. Сургут
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#111827]">
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
            { id: 'families', label: 'Семьи и абонементы', icon: Users },
            { id: 'payments', label: 'Оплаты и чеки', icon: FileText },
            { id: 'settings', label: 'Правила и выгрузка', icon: Settings },
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
                            placeholder="Например: Полка из массива"
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
                              const nextType =
                                e.target.value === 'individual' ? 'individual' : 'group';
                              setLessonType(nextType);
                              if (nextType === 'individual') setLessonCapacity(1);
                            }}
                            className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                          >
                            <option value="group">Групповое</option>
                            <option value="individual">Индивидуальное</option>
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
                            max={20}
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

                  {/* Lessons List */}
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
                                <span>
                                  {lesson.lesson_type === 'group'
                                    ? 'Групповое'
                                    : 'Индивидуальное'}
                                </span>
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
                                      <span className="font-semibold text-[#111827]">
                                        {b.child_name} ({pluralizeYears(b.child_age)})
                                      </span>
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
                                      {b.parent_name} · {b.phone} ·{' '}
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
                                    <span className="font-medium text-[#111827]">
                                      {w.child_name} ({w.parent_name}, {w.phone})
                                    </span>
                                    {!isFull && (
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

                          {/* Quick Manual Enroll */}
                          {lesson.is_canceled === 0 && !isFull && (
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
                                <option value="">Записать ребёнка...</option>
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
                                Записать
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

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
                        return (
                          <div
                            key={t.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                              active
                                ? 'border-[#E5E7EB] bg-[#F9FAFB]'
                                : 'border-[#E5E7EB] bg-white opacity-60'
                            }`}
                          >
                            <div>
                              <div className="text-sm font-semibold text-[#111827]">{t.title}</div>
                              <div className="text-xs text-[#6B7280] tabular-nums">
                                {pluralizeLessons(t.lessons_count)} · {formatMoney(t.price)} ·{' '}
                                {t.validity_days} дн.
                              </div>
                            </div>
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
                        Регистрация новой семьи
                      </h3>
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <input
                          type="text"
                          required
                          value={newParentName}
                          onChange={(e) => setNewParentName(e.target.value)}
                          placeholder="ФИО родителя"
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
                          type="text"
                          required
                          value={newChildName}
                          onChange={(e) => setNewChildName(e.target.value)}
                          placeholder="Имя ребёнка"
                          className="min-h-[44px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                        />
                        <input
                          type="number"
                          min={3}
                          max={18}
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
                          Сохранить семью
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
                              <h3 className="font-display text-lg font-semibold text-[#111827]">
                                {family.parent_name}
                              </h3>
                              {family.needs_renewal && (
                                <span className="rounded-lg bg-[#FFFBEB] px-2.5 py-0.5 text-xs font-semibold text-[#92400E]">
                                  Напомнить о продлении
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-[#6B7280] tabular-nums">
                              {family.phone}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#111827]">
                              <span className="text-xs font-medium text-[#6B7280]">Дети:</span>
                              {family.children.map((c) => (
                                <span
                                  key={c.id}
                                  className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-xs font-medium"
                                >
                                  {c.name}, {pluralizeYears(c.age)}
                                </span>
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
                                + Добавить ребёнка
                              </button>
                            </div>

                            {addChildFamilyId === family.id && (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={extraChildName}
                                  onChange={(e) => setExtraChildName(e.target.value)}
                                  placeholder="Имя ребёнка"
                                  className="min-h-[40px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs"
                                />
                                <input
                                  type="number"
                                  min={3}
                                  max={18}
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
                            onClick={() => onNavigate(`/lk/${family.access_token}`)}
                            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3.5 text-xs font-medium text-white hover:bg-[#B05B20]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Открыть кабинет родителя
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
                          onChange={(e) => setPayTariffId(e.target.value)}
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

                    {payTariffId === 'custom' && (
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
                            {p.receipt_url && (
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
                                <a
                                  href={`/api/files/receipts/${p.id}?inline=1${
                                    sessionToken ? `&session=${encodeURIComponent(sessionToken)}` : ''
                                  }`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#ECFDF5] px-3 text-xs font-semibold text-[#065F46]"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  Открыть чек
                                </a>
                                <a
                                  href={`/api/files/receipts/${p.id}${
                                    sessionToken ? `?session=${encodeURIComponent(sessionToken)}` : ''
                                  }`}
                                  download={p.receipt_original_name || 'receipt'}
                                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                                >
                                  <Download className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                                  Скачать
                                </a>
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

              {/* TAB 4: SETTINGS, CSV EXPORTS & BACKUP */}
              {activeTab === 'settings' && (
                <motion.div
                  key="m-settings"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="grid grid-cols-1 gap-6 lg:grid-cols-2"
                >
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

                      <button
                        type="submit"
                        className="min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20]"
                      >
                        Сохранить правила
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
                        <a
                          href={`/api/master/export/clients${
                            sessionToken ? `?session=${encodeURIComponent(sessionToken)}` : ''
                          }`}
                          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                          Клиенты
                        </a>
                        <a
                          href={`/api/master/export/attendance${
                            sessionToken ? `?session=${encodeURIComponent(sessionToken)}` : ''
                          }`}
                          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                          Посещения
                        </a>
                        <a
                          href={`/api/master/export/payments${
                            sessionToken ? `?session=${encodeURIComponent(sessionToken)}` : ''
                          }`}
                          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                          Оплаты
                        </a>
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
                          <a
                            href={`/api/master/backup${
                              sessionToken ? `?session=${encodeURIComponent(sessionToken)}` : ''
                            }`}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#111827] px-4 text-xs font-medium text-white hover:bg-[#1F2937]"
                          >
                            <Database className="h-4 w-4" strokeWidth={1.5} />
                            Скачать бэкап БД
                          </a>
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

                    {/* MoyKlass CSV Import */}
                    <form
                      onSubmit={handleImportCsv}
                      className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <h3 className="font-display text-base font-semibold text-[#111827]">
                        Импорт семей из выгрузки «МойКласс» (CSV)
                      </h3>
                      <p className="mt-1 text-xs text-[#6B7280]">
                        Формат строк: Родитель;Телефон;Имя ребёнка;Возраст;Остаток занятий
                      </p>
                      <textarea
                        rows={4}
                        value={csvImportText}
                        onChange={(e) => setCsvImportText(e.target.value)}
                        placeholder="Ольга Петрова;+7 (922) 400-77-88;Кирилл;9;4"
                        className="mt-3 w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#111827] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="mt-3 min-h-[44px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-4 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                      >
                        Импортировать строки
                      </button>
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
    </div>
  );
};
