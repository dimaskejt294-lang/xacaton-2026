import {
  AlertCircle,
  Bell,
  BellOff,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  History,
  Lock,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Star,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { LegalDocumentItem, ParentDashboardData } from '../types.ts';
import {
  bookingStatusClasses,
  bookingStatusLabel,
  formatDateRu,
  formatDateTimeRu,
  formatMoney,
  lessonTypeLabel,
  paymentMethodLabel,
  paymentStatusClasses,
  paymentStatusLabel,
  pluralizeLessons,
  pluralizeYears,
} from '../utils/format.ts';
import {
  getDevicePushStatus,
  subscribeFamilyPush,
} from '../utils/pushClient.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

function isSafeHttpUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

interface ParentCabinetPageProps {
  token: string;
  onNavigate: (path: string) => void;
  onTokenValid: (token: string) => void;
}

type CabinetTab = 'schedule' | 'upcoming' | 'history' | 'payments' | 'notifications';

export const ParentCabinetPage: React.FC<ParentCabinetPageProps> = ({
  token,
  onNavigate,
  onTokenValid,
}) => {
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<CabinetTab>('schedule');
  const [selectedChildId, setSelectedChildId] = useState<number | 'all'>('all');
  const [isMakeupBooking, setIsMakeupBooking] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<{
    paymentId: number;
    url: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [previewReceipt, setPreviewReceipt] = useState<{
    name: string;
    blobUrl: string;
    isPdf: boolean;
  } | null>(null);
  const [selectedTariffId, setSelectedTariffId] = useState<number | null>(null);
  const [acceptedOffer, setAcceptedOffer] = useState(false);
  const [acceptedPersonalData, setAcceptedPersonalData] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [checkoutGroupNotice, setCheckoutGroupNotice] = useState<string | null>(null);
  const [previewLegalDoc, setPreviewLegalDoc] = useState<LegalDocumentItem | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribedOnDevice, setPushSubscribedOnDevice] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushBusy, setPushBusy] = useState(false);

  const allConsentsChecked = acceptedOffer && acceptedPersonalData && acceptedPrivacy;

  useEffect(() => {
    void getDevicePushStatus().then((status) => {
      setPushSupported(status.supported);
      setPushPermission(status.permission);
      setPushSubscribedOnDevice(status.subscribed);
    });
  }, [token]);

  useEffect(() => {
    const activeBlobUrl = previewReceipt?.blobUrl;
    return () => {
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [previewReceipt]);

  const loadCabinet = useCallback(async () => {
    setLoading(true);
    setNotFoundError(null);
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotFoundError(
          body.error || 'Кабинет по указанной ссылке не найден или ссылка была отозвана'
        );
        setData(null);
        return;
      }
      const json = (await res.json()) as ParentDashboardData;
      setData(json);
      onTokenValid(token);
      setSelectedChildId((prev) => {
        if (prev !== 'all' && json.children.some((c) => c.id === prev)) {
          return prev;
        }
        return json.children[0]?.id ?? 'all';
      });
      setSelectedTariffId((prev) => {
        if (prev !== null && json.tariffs.some((t) => t.id === prev)) {
          return prev;
        }
        return json.tariffs[0]?.id ?? null;
      });
    } catch {
      setNotFoundError('Не удалось загрузить данные кабинета. Попробуйте обновить страницу.');
    } finally {
      setLoading(false);
    }
  }, [token, onTokenValid]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returningPaymentId = params.get('payment_id');

    const run = async () => {
      if (returningPaymentId && /^\d+$/.test(returningPaymentId)) {
        try {
          const syncRes = await fetch(
            `/api/lk/${encodeURIComponent(token)}/payments/${returningPaymentId}/sync`,
            { method: 'POST' }
          );
          const syncJson = (await syncRes.json()) as { status?: string; error?: string };
          if (syncRes.ok && syncJson.status === 'succeeded') {
            setBanner({
              type: 'success',
              text: 'Оплата через ЮKassa подтверждена, занятия зачислены на абонемент.',
            });
            setActiveTab('payments');
          } else if (syncRes.ok && syncJson.status === 'pending') {
            setBanner({
              type: 'error',
              text: 'Платёж ещё обрабатывается банком. Вы можете проверить статус повторно через пару секунд.',
            });
            setActiveTab('payments');
          }
        } catch {
          // Ignore sync failure on initial return; user can click sync manually
        } finally {
          window.history.replaceState({}, '', `/lk/${encodeURIComponent(token)}`);
        }
      }
      await loadCabinet();
    };

    void run();
  }, [token, loadCabinet]);

  const activeChildIdForAction = useMemo(() => {
    if (!data || data.children.length === 0) return null;
    if (selectedChildId !== 'all') return selectedChildId;
    return data.children[0].id;
  }, [data, selectedChildId]);

  const activeChild = useMemo(() => {
    if (!data || activeChildIdForAction === null) return null;
    return data.children.find((c) => c.id === activeChildIdForAction) ?? null;
  }, [data, activeChildIdForAction]);

  const childHasMissed = useMemo(() => {
    if (!data || activeChildIdForAction === null) return false;
    return data.bookings.some(
      (b) => b.child_id === activeChildIdForAction && b.status === 'missed'
    );
  }, [data, activeChildIdForAction]);

  const upcomingBookings = useMemo(() => {
    if (!data) return [];
    return data.bookings.filter((b) => {
      const childMatch = selectedChildId === 'all' || b.child_id === selectedChildId;
      return childMatch && b.status === 'booked' && new Date(b.start_time).getTime() >= Date.now() - 2 * 3600 * 1000;
    });
  }, [data, selectedChildId]);

  const historyBookings = useMemo(() => {
    if (!data) return [];
    return data.bookings.filter((b) => {
      const childMatch = selectedChildId === 'all' || b.child_id === selectedChildId;
      return childMatch && b.status !== 'booked';
    });
  }, [data, selectedChildId]);

  const handleBookLesson = async (lessonId: number, goToPaymentAfter = false) => {
    if (!activeChildIdForAction) return;
    setBanner(null);
    setBusyKey(`book-${lessonId}`);
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lessonId,
          child_id: activeChildIdForAction,
          is_makeup: isMakeupBooking,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBanner({ type: 'error', text: body.error || 'Не удалось записать ребёнка' });
        await loadCabinet();
        return;
      }
      setIsMakeupBooking(false);
      const chosenLesson = data?.schedule.find((l) => l.id === lessonId);
      if (goToPaymentAfter && chosenLesson) {
        setCheckoutGroupNotice(
          `${activeChild?.name ?? 'Ребёнок'} записан(а) на «${chosenLesson.title}» (${formatDateTimeRu(chosenLesson.start_time)}). Выберите тариф, подтвердите согласия и перейдите к оплате.`
        );
        setActiveTab('payments');
      } else {
        setBanner({
          type: 'success',
          text: `${activeChild?.name ?? 'Ребёнок'} успешно записан(а) на занятие.`,
        });
      }
      await loadCabinet();
    } catch {
      setBanner({ type: 'error', text: 'Ошибка сети при записи на занятие' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleJoinWaitlist = async (lessonId: number) => {
    if (!activeChildIdForAction) return;
    setBanner(null);
    setBusyKey(`wait-${lessonId}`);
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lessonId,
          child_id: activeChildIdForAction,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBanner({ type: 'error', text: body.error || 'Не удалось добавить в лист ожидания' });
        return;
      }
      setBanner({
        type: 'success',
        text: `${activeChild?.name ?? 'Ребёнок'} добавлен(а) в лист ожидания.`,
      });
      await loadCabinet();
    } catch {
      setBanner({ type: 'error', text: 'Ошибка сети при добавлении в лист ожидания' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleCancelBooking = async (bookingId: number) => {
    setBanner(null);
    setBusyKey(`cancel-${bookingId}`);
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}/bookings/${bookingId}/cancel`, {
        method: 'POST',
      });
      const body = (await res.json()) as { charged?: boolean; error?: string };
      if (!res.ok) {
        setBanner({ type: 'error', text: body.error || 'Не удалось отменить запись' });
        return;
      }
      setBanner({
        type: 'success',
        text: body.charged
          ? 'Запись отменена. Списано 1 занятие согласно правилам поздней отмены.'
          : 'Запись отменена без списания.',
      });
      await loadCabinet();
    } catch {
      setBanner({ type: 'error', text: 'Ошибка сети при отмене записи' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleStartPayment = async (tariffId: number) => {
    setBanner(null);
    if (!allConsentsChecked) {
      setBanner({
        type: 'error',
        text: 'Отметьте все три галочки: договор-оферта, обработка персональных данных и политика конфиденциальности.',
      });
      return;
    }
    setBusyKey(`pay-${tariffId}`);
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tariff_id: tariffId,
          accepted_offer: acceptedOffer,
          accepted_personal_data: acceptedPersonalData,
          accepted_privacy: acceptedPrivacy,
        }),
      });
      const body = (await res.json()) as {
        payment_id?: number;
        confirmation_url?: string;
        error?: string;
      };
      if (!res.ok || !body.confirmation_url) {
        setBanner({
          type: 'error',
          text: body.error || 'Не удалось создать платёж в ЮKassa',
        });
        return;
      }

      await loadCabinet();

      const inIframe = window.self !== window.top;
      if (inIframe) {
        setPendingCheckout({
          paymentId: body.payment_id ?? 0,
          url: body.confirmation_url,
        });
        setBanner({
          type: 'success',
          text: 'Счёт в ЮKassa сформирован. Откройте страницу оплаты по кнопке ниже, а затем нажмите «Проверить оплату».',
        });
      } else {
        window.location.assign(body.confirmation_url);
      }
    } catch {
      setBanner({ type: 'error', text: 'Ошибка обращения к платёжному шлюзу ЮKassa' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleSyncPayment = async (paymentId: number) => {
    setBanner(null);
    setBusyKey(`sync-${paymentId}`);
    try {
      const res = await fetch(
        `/api/lk/${encodeURIComponent(token)}/payments/${paymentId}/sync`,
        { method: 'POST' }
      );
      const body = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) {
        setBanner({ type: 'error', text: body.error || 'Не удалось проверить статус платежа' });
        return;
      }
      if (body.status === 'succeeded') {
        setBanner({
          type: 'success',
          text: 'Оплата подтверждена, занятия зачислены на баланс семьи.',
        });
      } else {
        setBanner({
          type: 'error',
          text: `Текущий статус платежа в ЮKassa: ${body.status ?? 'pending'}.`,
        });
      }
      await loadCabinet();
    } catch {
      setBanner({ type: 'error', text: 'Ошибка проверки статуса платежа' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleMarkNotificationRead = async (notificationId: number) => {
    await fetch(
      `/api/lk/${encodeURIComponent(token)}/notifications/${notificationId}/read`,
      { method: 'POST' }
    );
    await loadCabinet();
  };

  const handleMarkAllRead = async () => {
    await fetch(`/api/lk/${encodeURIComponent(token)}/notifications/read-all`, {
      method: 'POST',
    });
    await loadCabinet();
  };

  const handleOpenReceiptPreview = async (paymentId: number, originalName?: string | null) => {
    setBanner(null);
    setBusyKey(`receipt-view-${paymentId}`);
    try {
      const res = await fetch(`/api/files/receipts/${paymentId}?inline=1`, {
        headers: { 'X-Family-Token': token },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setBanner({ type: 'error', text: body.error || 'Не удалось загрузить файл чека' });
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const name = originalName || `Чек_${paymentId}`;
      const isPdf = blob.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
      setPreviewReceipt({ name, blobUrl, isPdf });
    } catch {
      setBanner({ type: 'error', text: 'Ошибка загрузки файла чека' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleDownloadReceiptFile = async (paymentId: number, originalName?: string | null) => {
    setBanner(null);
    setBusyKey(`receipt-dl-${paymentId}`);
    try {
      const res = await fetch(`/api/files/receipts/${paymentId}`, {
        headers: { 'X-Family-Token': token },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setBanner({ type: 'error', text: body.error || 'Не удалось скачать файл чека' });
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = originalName || `receipt_${paymentId}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      setBanner({ type: 'error', text: 'Ошибка скачивания файла чека' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleEnablePush = async () => {
    setBanner(null);
    setPushBusy(true);
    try {
      const result = await subscribeFamilyPush(token);
      if ('Notification' in window) {
        setPushPermission(Notification.permission);
      }
      if (!result.ok) {
        setBanner({ type: 'error', text: result.message });
        return;
      }
      setPushSubscribedOnDevice(true);
      setBanner({ type: 'success', text: result.message });
      await loadCabinet();
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setBanner(null);
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch(`/api/lk/${encodeURIComponent(token)}/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
      setPushSubscribedOnDevice(false);
      setBanner({
        type: 'success',
        text: 'Push-уведомления на этом устройстве отключены.',
      });
      await loadCabinet();
    } catch {
      setBanner({ type: 'error', text: 'Не удалось отключить уведомления' });
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    setBanner(null);
    setPushBusy(true);
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}/push/test`, {
        method: 'POST',
      });
      const body = (await res.json()) as { sent?: number; error?: string };
      if (!res.ok) {
        setBanner({ type: 'error', text: body.error || 'Ошибка отправки тестового уведомления' });
        return;
      }
      setBanner({
        type: 'success',
        text:
          (body.sent ?? 0) > 0
            ? `Тестовое уведомление отправлено на устройство (${body.sent}).`
            : 'Уведомление добавлено в кабинет, но активных push-устройств пока нет.',
      });
      await loadCabinet();
    } catch {
      setBanner({ type: 'error', text: 'Ошибка сети при отправке тестового уведомления' });
    } finally {
      setPushBusy(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    setBusyKey('submit-review');
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: reviewRating,
          text: reviewText,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBanner({ type: 'error', text: body.error || 'Не удалось сохранить отзыв' });
        return;
      }
      setReviewText('');
      setReviewRating(5);
      setBanner({
        type: 'success',
        text: 'Спасибо! Ваш отзыв сохранён и опубликован на главной странице мастерской.',
      });
      await loadCabinet();
    } catch {
      setBanner({ type: 'error', text: 'Ошибка сети при отправке отзыва' });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
          <div className="h-32 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
        </div>
        <div className="mt-6 h-72 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
      </div>
    );
  }

  if (notFoundError || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <AlertCircle className="mx-auto h-9 w-9 text-[#991B1B]" strokeWidth={1.5} />
          <h1 className="mt-4 font-display text-xl font-bold text-[#111827]">
            Кабинет недоступен
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
            {notFoundError || 'Персональная ссылка не найдена или была перевыпущена мастером.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/schedule')}
            className="mt-6 min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20]"
          >
            Перейти к расписанию
          </button>
        </div>
      </div>
    );
  }

  const balanceNegative = data.family.money_balance < 0;
  const balancePositive = data.family.money_balance > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-[#6B7280]">
            Личный кабинет семьи · {data.family.phone}
          </div>
          <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-[#111827]">
            {data.family.parent_name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PWAInstallButton
            variant="cabinet"
            familyToken={token}
            onPushEnabled={() => {
              setPushSubscribedOnDevice(true);
              setPushPermission('granted');
              void loadCabinet();
            }}
          />

          {!pushSubscribedOnDevice && (
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => void handleEnablePush()}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#C86D2D] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#B05B20] disabled:opacity-60"
            >
              <BellRing className="h-4 w-4" strokeWidth={1.75} />
              <span>{pushBusy ? 'Подключение...' : 'Уведомления на телефон'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className="relative inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] shadow-sm transition-colors hover:bg-[#F9FAFB]"
          >
            <Bell className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
            <span>Уведомления</span>
            {data.unread_notifications_count > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C86D2D] px-1.5 text-xs font-semibold text-white tabular-nums">
                {data.unread_notifications_count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
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
              Скрыть
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two Distinct Summary Cards: Remaining Lessons vs Money Balance */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_22px_-16px_rgba(17,24,39,0.08)]"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#6B7280]">Остаток занятий</span>
            <Calendar className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
          </div>

          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-4xl font-bold tracking-tight text-[#111827] tabular-nums">
              {data.total_remaining_lessons}
            </span>
            <span className="text-sm text-[#6B7280]">
              {pluralizeLessons(data.total_remaining_lessons).replace(/^\d+\s*/, '')}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#F3F4F6] pt-3 text-xs">
            {data.subscriptions.length > 0 ? (
              <div className="space-y-1 text-[#6B7280] tabular-nums">
                {data.subscriptions.map((sub) => (
                  <div key={sub.id}>
                    {sub.title}: осталось {sub.remaining_lessons} из {sub.total_lessons} · до{' '}
                    {formatDateRu(sub.expires_at)}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-[#6B7280]">Активных абонементов нет</span>
            )}

            {data.total_remaining_lessons <= 1 && (
              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                className="cursor-pointer rounded-lg bg-[#FFFBEB] px-2.5 py-1 font-semibold text-[#92400E] hover:bg-[#FEF3C7]"
              >
                Продлить абонемент
              </button>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.04 }}
          className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_22px_-16px_rgba(17,24,39,0.08)]"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#6B7280]">
              Денежный баланс / Задолженность
            </span>
            <Wallet className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
          </div>

          <div className="mt-2 flex items-baseline gap-3">
            <span
              className={`font-display text-4xl font-bold tracking-tight tabular-nums ${
                balanceNegative
                  ? 'text-[#991B1B]'
                  : balancePositive
                  ? 'text-[#065F46]'
                  : 'text-[#111827]'
              }`}
            >
              {formatMoney(data.family.money_balance)}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#F3F4F6] pt-3 text-xs">
            <span
              className={`inline-flex items-center rounded-lg px-2 py-0.5 font-semibold ${
                balanceNegative
                  ? 'bg-[#FEF2F2] text-[#991B1B]'
                  : balancePositive
                  ? 'bg-[#ECFDF5] text-[#065F46]'
                  : 'bg-[#F3F4F6] text-[#6B7280]'
              }`}
            >
              {balanceNegative
                ? 'Есть задолженность по разовым занятиям'
                : balancePositive
                ? 'Положительный денежный баланс'
                : 'Задолженности нет'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Children Switcher */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-[#6B7280]">Ребёнок:</span>
        {data.children.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => setSelectedChildId(child.id)}
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-all duration-150 ${
              selectedChildId === child.id
                ? 'border-[#C86D2D] bg-[#FDF4ED] text-[#111827] shadow-sm'
                : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <User className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
            <span>{child.name}</span>
            <span className="text-xs text-[#6B7280] tabular-nums">
              {pluralizeYears(child.age)}
            </span>
          </button>
        ))}

        {data.children.length > 1 && (
          <button
            type="button"
            onClick={() => setSelectedChildId('all')}
            className={`min-h-[44px] cursor-pointer rounded-xl border px-3.5 text-sm font-medium transition-colors ${
              selectedChildId === 'all'
                ? 'border-[#C86D2D] bg-[#FDF4ED] text-[#111827]'
                : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            Вся семья
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white p-1.5">
        {(
          [
            { id: 'schedule', label: 'Записаться', icon: Calendar },
            {
              id: 'upcoming',
              label: `Ближайшие (${upcomingBookings.length})`,
              icon: Clock,
            },
            { id: 'history', label: 'История', icon: History },
            { id: 'payments', label: 'Оплаты и чеки', icon: CreditCard },
            {
              id: 'notifications',
              label: `Уведомления${
                data.unread_notifications_count > 0
                  ? ` (${data.unread_notifications_count})`
                  : ''
              }`,
              icon: Bell,
            },
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

      {/* Tab Content */}
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {activeTab === 'schedule' && (
            <motion.div
              key="tab-schedule"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="space-y-4"
            >
              {activeChild && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm">
                  <div>
                    <span className="text-[#6B7280]">Запись оформляется для: </span>
                    <span className="font-semibold text-[#111827]">
                      {activeChild.name} ({pluralizeYears(activeChild.age)})
                    </span>
                  </div>

                  {childHasMissed && (
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#111827]">
                      <input
                        type="checkbox"
                        checked={isMakeupBooking}
                        onChange={(e) => setIsMakeupBooking(e.target.checked)}
                        className="h-4 w-4 accent-[#C86D2D]"
                      />
                      Записать как отработку пропуска
                    </label>
                  )}
                </div>
              )}

              {data.schedule.length === 0 ? (
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center text-sm text-[#6B7280]">
                  Предстоящих занятий в расписании пока нет.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {data.schedule.map((lesson) => {
                    const alreadyBooked =
                      activeChildIdForAction !== null &&
                      data.bookings.some(
                        (b) =>
                          b.lesson_id === lesson.id &&
                          b.child_id === activeChildIdForAction &&
                          b.status === 'booked'
                      );
                    const alreadyWaiting =
                      activeChildIdForAction !== null &&
                      data.waitlist.some(
                        (w) =>
                          w.lesson_id === lesson.id && w.child_id === activeChildIdForAction
                      );
                    const isFull = lesson.free_spots === 0;

                    return (
                      <div
                        key={lesson.id}
                        className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-[#6B7280] tabular-nums">
                              {lessonTypeLabel(lesson.lesson_type)} · {lesson.duration_minutes} мин
                            </span>
                            <span
                              className={`rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums ${
                                isFull
                                  ? 'bg-[#FEF2F2] text-[#991B1B]'
                                  : lesson.free_spots === 1
                                  ? 'bg-[#FFFBEB] text-[#92400E]'
                                  : 'bg-[#ECFDF5] text-[#065F46]'
                              }`}
                            >
                              {isFull
                                ? 'Мест нет'
                                : `Мест: ${lesson.free_spots} из ${lesson.capacity}`}
                            </span>
                          </div>

                          <h3 className="mt-2.5 font-display text-lg font-semibold text-[#111827]">
                            {lesson.title}
                          </h3>
                          {lesson.description && (
                            <p className="mt-1 text-sm text-[#6B7280]">{lesson.description}</p>
                          )}
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#F3F4F6] pt-4">
                          <div>
                            <div className="text-sm font-semibold text-[#111827] tabular-nums">
                              {formatDateTimeRu(lesson.start_time)}
                            </div>
                            <div className="text-xs text-[#6B7280] tabular-nums">
                              {formatMoney(lesson.single_price)} или 1 зан. с абонемента
                            </div>
                          </div>

                          {alreadyBooked ? (
                            <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#ECFDF5] px-4 text-sm font-semibold text-[#065F46]">
                              <Check className="h-4 w-4" strokeWidth={1.5} />
                              Записан(а)
                            </span>
                          ) : alreadyWaiting ? (
                            <span className="inline-flex min-h-[44px] items-center rounded-xl bg-[#FFFBEB] px-4 text-sm font-medium text-[#92400E]">
                              В листе ожидания
                            </span>
                          ) : isFull ? (
                            <button
                              type="button"
                              disabled={busyKey === `wait-${lesson.id}`}
                              onClick={() => void handleJoinWaitlist(lesson.id)}
                              className="min-h-[44px] cursor-pointer rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-sm font-medium text-[#111827] transition-colors hover:bg-[#F3F4F6] disabled:opacity-60"
                            >
                              {busyKey === `wait-${lesson.id}`
                                ? 'Добавление...'
                                : 'Встать в лист ожидания'}
                            </button>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={busyKey === `book-${lesson.id}`}
                                onClick={() =>
                                  void handleBookLesson(
                                    lesson.id,
                                    data.total_remaining_lessons === 0
                                  )
                                }
                                className="min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#B05B20] active:scale-[0.98] disabled:opacity-60"
                              >
                                {busyKey === `book-${lesson.id}`
                                  ? 'Запись...'
                                  : data.total_remaining_lessons === 0
                                    ? `Записать и оплатить (${activeChild?.name ?? ''})`
                                    : `Записать (${activeChild?.name ?? ''})`}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'upcoming' && (
            <motion.div
              key="tab-upcoming"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="space-y-3"
            >
              {upcomingBookings.length === 0 ? (
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center">
                  <div className="font-display text-base font-semibold text-[#111827]">
                    Ближайших записей нет
                  </div>
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Выберите подходящее время во вкладке «Записаться».
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('schedule')}
                    className="mt-4 min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white"
                  >
                    Открыть расписание
                  </button>
                </div>
              ) : (
                upcomingBookings.map((b) => {
                  const hoursLeft =
                    (new Date(b.start_time).getTime() - Date.now()) / (1000 * 60 * 60);
                  const isLate =
                    hoursLeft < data.settings.free_cancel_hours &&
                    data.settings.charge_on_late_cancel === 1;

                  return (
                    <div
                      key={b.id}
                      className="flex flex-col justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
                          <span className="font-semibold text-[#111827]">{b.child_name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatDateTimeRu(b.start_time)}</span>
                          {b.is_makeup === 1 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-[#C86D2D]">Отработка</span>
                            </>
                          )}
                        </div>
                        <div className="mt-1 font-display text-base font-semibold text-[#111827]">
                          {b.lesson_title}
                        </div>
                        <div className="mt-1 text-xs text-[#6B7280]">
                          {isLate
                            ? `До начала менее ${data.settings.free_cancel_hours} ч — при отмене спишется занятие`
                            : `Бесплатная отмена доступна (за ${data.settings.free_cancel_hours} ч до начала)`}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busyKey === `cancel-${b.id}`}
                        onClick={() => void handleCancelBooking(b.id)}
                        className="min-h-[44px] shrink-0 cursor-pointer rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 text-sm font-medium text-[#991B1B] transition-colors hover:bg-[#FEE2E2] disabled:opacity-60"
                      >
                        {busyKey === `cancel-${b.id}` ? 'Отмена...' : 'Отменить запись'}
                      </button>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="tab-history"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {historyBookings.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#6B7280]">
                    История посещений пока пуста.
                  </div>
                ) : (
                  <div className="divide-y divide-[#F3F4F6]">
                    {historyBookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
                            <span className="font-semibold text-[#111827]">{b.child_name}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formatDateTimeRu(b.start_time)}</span>
                          </div>
                          <div className="mt-0.5 font-medium text-[#111827]">{b.lesson_title}</div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs text-[#6B7280]">
                            {b.is_charged
                              ? b.charge_amount > 0
                                ? `Списано ${formatMoney(b.charge_amount)}`
                                : 'Списано с абонемента'
                              : 'Не списано'}
                          </span>
                          <span
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${bookingStatusClasses(
                              b.status
                            )}`}
                          >
                            {bookingStatusLabel(b.status)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Parent Review Form */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.5} />
                  <h3 className="font-display text-base font-semibold text-[#111827]">
                    Оставить отзыв о мастерской «Ясна»
                  </h3>
                </div>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Поделитесь впечатлениями о занятиях — отзыв появится на странице расписания.
                </p>

                <form onSubmit={handleSubmitReview} className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-2 text-xs font-medium text-[#6B7280]">Оценка:</span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        aria-label={`Поставить оценку ${star}`}
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] transition-colors hover:bg-[#FDF4ED]"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            star <= reviewRating
                              ? 'fill-[#C86D2D] text-[#C86D2D]'
                              : 'text-[#9CA3AF]'
                          }`}
                          strokeWidth={1.5}
                        />
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    required
                    minLength={5}
                    maxLength={1000}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Как прошло занятие, что смастерил ребёнок?"
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#C86D2D] focus:bg-white focus:outline-none"
                  />

                  <button
                    type="submit"
                    disabled={busyKey === 'submit-review'}
                    className="min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#B05B20] disabled:opacity-60"
                  >
                    {busyKey === 'submit-review' ? 'Отправка...' : 'Опубликовать отзыв'}
                  </button>
                </form>

                {data.reviews.length > 0 && (
                  <div className="mt-5 space-y-2.5 border-t border-[#F3F4F6] pt-4">
                    <div className="text-xs font-semibold text-[#6B7280]">Ваши отзывы</div>
                    {data.reviews.map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3.5 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-[#6B7280]">
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
                          <span className="tabular-nums">{formatDateRu(rev.created_at)}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-[#111827]">{rev.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'payments' && (
            <motion.div
              key="tab-payments"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="space-y-6"
            >
              {/* Online Tariffs Purchase */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <h2 className="font-display text-lg font-semibold text-[#111827]">
                  Оплатить абонемент или занятие онлайн
                </h2>
                <p className="mt-1 text-sm text-[#6B7280]">
                  Шаг 1 — выберите тариф. Шаг 2 — подтвердите оферту, согласие на обработку
                  персональных данных и политику конфиденциальности, чтобы активировать кнопку
                  перехода к оплате в ЮKassa.
                </p>

                {checkoutGroupNotice && (
                  <div className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-xs font-medium text-[#065F46]">
                    <span>{checkoutGroupNotice}</span>
                    <button
                      type="button"
                      onClick={() => setCheckoutGroupNotice(null)}
                      className="cursor-pointer underline"
                    >
                      Скрыть
                    </button>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {data.tariffs.map((tariff) => {
                    const isSelected = selectedTariffId === tariff.id;
                    return (
                      <button
                        key={tariff.id}
                        type="button"
                        onClick={() => setSelectedTariffId(tariff.id)}
                        className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                          isSelected
                            ? 'border-[#C86D2D] bg-[#FDF4ED] ring-2 ring-[#C86D2D]/20'
                            : 'border-[#E5E7EB] bg-[#F9FAFB] hover:border-[#D1D5DB]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#111827]">{tariff.title}</span>
                            {isSelected && (
                              <span className="rounded-md bg-[#C86D2D] px-2 py-0.5 text-[10px] font-semibold text-white">
                                Выбрано
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-[#6B7280] tabular-nums">
                            {pluralizeLessons(tariff.lessons_count)} · срок {tariff.validity_days} дн.
                          </div>
                        </div>
                        <div className="mt-3 font-display text-2xl font-bold text-[#111827] tabular-nums">
                          {formatMoney(tariff.price)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Mandatory Legal Checkboxes Gate */}
                <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
                    <ShieldCheck className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.75} />
                    <span>Обязательные согласия перед оплатой</span>
                  </div>

                  <div className="mt-3 space-y-2.5 text-xs text-[#374151]">
                    {(
                      [
                        {
                          key: 'offer' as const,
                          checked: acceptedOffer,
                          onChange: setAcceptedOffer,
                          prefix: 'Я принимаю условия ',
                          linkLabel: 'Договора-оферты',
                        },
                        {
                          key: 'personal_data' as const,
                          checked: acceptedPersonalData,
                          onChange: setAcceptedPersonalData,
                          prefix: 'Я даю ',
                          linkLabel: 'Согласие на обработку персональных данных',
                        },
                        {
                          key: 'privacy' as const,
                          checked: acceptedPrivacy,
                          onChange: setAcceptedPrivacy,
                          prefix: 'Я ознакомлен(а) с ',
                          linkLabel: 'Политикой конфиденциальности',
                        },
                      ] as const
                    ).map((item) => {
                      const doc = data.legal_documents?.find((d) => d.doc_key === item.key);
                      return (
                        <div key={item.key} className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={(e) => item.onChange(e.target.checked)}
                              className="h-4 w-4 shrink-0 rounded border-[#D1D5DB] accent-[#C86D2D]"
                            />
                            <span>
                              {item.prefix}
                              <span className="font-semibold text-[#111827]">{item.linkLabel}</span>
                            </span>
                          </label>
                          {doc && (
                            <button
                              type="button"
                              onClick={() => setPreviewLegalDoc(doc)}
                              className="cursor-pointer font-semibold text-[#C86D2D] underline hover:text-[#B05B20]"
                            >
                              Открыть документ
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    {!allConsentsChecked ? (
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#92400E]">
                        <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                        <span>
                          Отметьте все 3 галочки выше, чтобы ссылка на оплату стала активной
                        </span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#065F46]">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                        <span>Согласия подтверждены — можно перейти к оплате</span>
                      </div>
                    )}

                    {(() => {
                      const chosenTariff =
                        data.tariffs.find((t) => t.id === selectedTariffId) ?? data.tariffs[0];
                      if (!chosenTariff) return null;
                      const isBusy = busyKey === `pay-${chosenTariff.id}`;
                      const isLocked = !allConsentsChecked || isBusy;
                      return (
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => void handleStartPayment(chosenTariff.id)}
                          className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all ${
                            isLocked
                              ? 'cursor-not-allowed bg-[#E5E7EB] text-[#9CA3AF]'
                              : 'cursor-pointer bg-[#C86D2D] text-white shadow-sm hover:bg-[#B05B20] active:scale-[0.98]'
                          }`}
                        >
                          {!allConsentsChecked && <Lock className="h-4 w-4" strokeWidth={1.75} />}
                          {isBusy
                            ? 'Создание платежа...'
                            : `Оплатить ${formatMoney(chosenTariff.price)} (${chosenTariff.title})`}
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {pendingCheckout && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
                    <div className="text-sm text-[#92400E]">
                      Счёт создан в ЮKassa. Откройте форму оплаты в новой вкладке и после оплаты
                      нажмите «Проверить оплату».
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isSafeHttpUrl(pendingCheckout.url) && (
                        <a
                          href={pendingCheckout.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white hover:bg-[#B05B20]"
                        >
                          <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                          Перейти в ЮKassa
                        </a>
                      )}
                      {pendingCheckout.paymentId > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleSyncPayment(pendingCheckout.paymentId);
                            setPendingCheckout(null);
                          }}
                          className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#111827] hover:bg-[#F9FAFB]"
                        >
                          <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                          Проверить оплату
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Payments & Receipts History */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="border-b border-[#E5E7EB] px-5 py-4">
                  <h3 className="font-display text-base font-semibold text-[#111827]">
                    История платежей и чеки из «Мой налог»
                  </h3>
                </div>

                {data.payments.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#6B7280]">
                    Платежей пока нет.
                  </div>
                ) : (
                  <div className="divide-y divide-[#F3F4F6]">
                    {data.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-base font-bold text-[#111827] tabular-nums">
                              {formatMoney(payment.amount)}
                            </span>
                            <span
                              className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${paymentStatusClasses(
                                payment.status
                              )}`}
                            >
                              {paymentStatusLabel(payment.status)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-[#6B7280] tabular-nums">
                            {payment.tariff_title || pluralizeLessons(payment.lessons_count)} ·{' '}
                            {paymentMethodLabel(payment.payment_method)} ·{' '}
                            {formatDateTimeRu(payment.paid_at || payment.created_at)}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {payment.status === 'pending' && payment.external_payment_id && (
                            <button
                              type="button"
                              disabled={busyKey === `sync-${payment.id}`}
                              onClick={() => void handleSyncPayment(payment.id)}
                              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                            >
                              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                              Проверить оплату
                            </button>
                          )}

                          {payment.status === 'pending' && payment.confirmation_url && (
                            allConsentsChecked ? (
                              <a
                                href={payment.confirmation_url}
                                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3.5 text-xs font-medium text-white hover:bg-[#B05B20]"
                              >
                                Завершить оплату
                              </a>
                            ) : (
                              <button
                                type="button"
                                disabled
                                title="Отметьте все 3 согласия выше, чтобы активировать оплату"
                                className="inline-flex min-h-[44px] cursor-not-allowed items-center gap-1.5 rounded-xl bg-[#E5E7EB] px-3.5 text-xs font-medium text-[#9CA3AF]"
                              >
                                <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
                                Завершить оплату
                              </button>
                            )
                          )}

                          {payment.receipt_url && isSafeHttpUrl(payment.receipt_url) && (
                            <a
                              href={payment.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                              Открыть чек
                            </a>
                          )}

                          {payment.has_receipt_file === 1 && (
                            <>
                              <button
                                type="button"
                                disabled={busyKey === `receipt-view-${payment.id}`}
                                onClick={() =>
                                  void handleOpenReceiptPreview(
                                    payment.id,
                                    payment.receipt_original_name
                                  )
                                }
                                className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#ECFDF5] px-3.5 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5] disabled:opacity-60"
                              >
                                <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                                {busyKey === `receipt-view-${payment.id}`
                                  ? 'Открытие...'
                                  : 'Открыть чек'}
                              </button>
                              <button
                                type="button"
                                disabled={busyKey === `receipt-dl-${payment.id}`}
                                onClick={() =>
                                  void handleDownloadReceiptFile(
                                    payment.id,
                                    payment.receipt_original_name
                                  )
                                }
                                className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
                              >
                                <Download className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                                {busyKey === `receipt-dl-${payment.id}`
                                  ? 'Скачивание...'
                                  : 'Скачать чек'}
                              </button>
                            </>
                          )}

                          {payment.status === 'succeeded' &&
                            !payment.receipt_url &&
                            payment.has_receipt_file === 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-[#6B7280]">
                                <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                                Чек готовится мастером
                              </span>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Legal Documents Card in Parent Cabinet */}
              {data.legal_documents && data.legal_documents.length > 0 && (
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.75} />
                    <h3 className="font-display text-base font-semibold text-[#111827]">
                      Оферта, обработка персональных данных и политика конфиденциальности
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    Вы можете в любой момент открыть или скачать актуальные документы мастерской
                    «Ясна».
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {data.legal_documents.map((doc) => (
                      <div
                        key={doc.doc_key}
                        className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3.5"
                      >
                        <div>
                          <div className="text-sm font-semibold text-[#111827]">{doc.title}</div>
                          <div className="mt-1 text-[11px] text-[#6B7280]">
                            {doc.has_file === 1 && doc.original_name
                              ? `Файл: ${doc.original_name}`
                              : 'Текстовая редакция'}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewLegalDoc(doc)}
                            className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                          >
                            <Eye className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                            Открыть
                          </button>
                          <a
                            href={`/api/public/legal/${doc.doc_key}/file`}
                            download={doc.original_name || `${doc.doc_key}.txt`}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
                          >
                            <Download className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                            Скачать
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div
              key="tab-notifications"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="space-y-5"
            >
              {/* PWA Home Screen & Phone Web Push Card */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.75} />
                      <h2 className="font-display text-base font-semibold text-[#111827]">
                        Уведомления на телефон и иконка на экране
                      </h2>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                      Закрепите личный кабинет на рабочем столе и включите push-уведомления:
                      будут приходить чеки об оплате, подтверждения записи, отметки посещаемости
                      (был/пропустил) и напоминание за 24 часа до занятия.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <PWAInstallButton
                      variant="cabinet"
                      familyToken={token}
                      onPushEnabled={() => {
                        setPushSubscribedOnDevice(true);
                        setPushPermission('granted');
                        void loadCabinet();
                      }}
                    />
                    {pushSubscribedOnDevice ? (
                      <>
                        <button
                          type="button"
                          disabled={pushBusy}
                          onClick={() => void handleTestPush()}
                          className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3.5 text-xs font-semibold text-white hover:bg-[#B05B20] disabled:opacity-60"
                        >
                          <BellRing className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Проверить push
                        </button>
                        <button
                          type="button"
                          disabled={pushBusy}
                          onClick={() => void handleDisablePush()}
                          className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
                        >
                          <BellOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Отключить
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={pushBusy}
                        onClick={() => void handleEnablePush()}
                        className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#C86D2D] px-4 text-xs font-semibold text-white hover:bg-[#B05B20] disabled:opacity-60"
                      >
                        <BellRing className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {pushBusy ? 'Подключение...' : 'Включить уведомления'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#F3F4F6] pt-3 text-xs text-[#6B7280]">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold ${
                      pushSubscribedOnDevice
                        ? 'bg-[#ECFDF5] text-[#065F46]'
                        : 'bg-[#F3F4F6] text-[#6B7280]'
                    }`}
                  >
                    {pushSubscribedOnDevice
                      ? 'Это устройство подключено'
                      : pushPermission === 'denied'
                        ? 'Уведомления заблокированы в браузере'
                        : 'Это устройство ещё не подключено'}
                  </span>
                  <span className="tabular-nums">
                    Активных устройств семьи: {data.push_subscription_count ?? 0}
                  </span>
                  <span>
                    На iPhone/iPad: сначала «Поделиться → На экран „Домой“», затем включите
                    уведомления.
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
                  <h2 className="font-display text-base font-semibold text-[#111827]">
                    История уведомлений в кабинете
                  </h2>
                  {data.unread_notifications_count > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleMarkAllRead()}
                      className="min-h-[40px] cursor-pointer text-xs font-semibold text-[#C86D2D] hover:text-[#B05B20]"
                    >
                      Отметить все прочитанными
                    </button>
                  )}
                </div>

              {data.notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#6B7280]">Уведомлений пока нет.</div>
              ) : (
                <div className="divide-y divide-[#F3F4F6]">
                  {data.notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:px-5 ${
                        n.is_read === 0 ? 'bg-[#FDF8F3]' : 'bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#111827]">{n.title}</span>
                          {n.is_read === 0 && (
                            <span className="rounded bg-[#FFFBEB] px-1.5 py-0.5 text-[11px] font-semibold text-[#92400E]">
                              Новое
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[#6B7280]">{n.message}</p>
                        <div className="mt-1 text-xs text-[#9CA3AF] tabular-nums">
                          {formatDateTimeRu(n.created_at)}
                        </div>
                      </div>

                      {n.is_read === 0 && (
                        <button
                          type="button"
                          onClick={() => void handleMarkNotificationRead(n.id)}
                          className="min-h-[44px] shrink-0 cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                        >
                          Прочитано
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
                  href={previewReceipt.blobUrl}
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
                <div className="whitespace-pre-wrap rounded-xl border border-[#E5E7EB] bg-white p-5 text-sm leading-relaxed text-[#111827]">
                  {previewLegalDoc.content_text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
