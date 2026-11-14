import {
  AlertCircle,
  Bell,
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
  MessageSquare,
  RefreshCw,
  Star,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ParentDashboardData } from '../types.ts';
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
    inlineUrl: string;
    downloadUrl: string;
    isPdf: boolean;
  } | null>(null);

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

  const handleBookLesson = async (lessonId: number) => {
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
      setBanner({
        type: 'success',
        text: `${activeChild?.name ?? 'Ребёнок'} успешно записан(а) на занятие.`,
      });
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
    setBusyKey(`pay-${tariffId}`);
    try {
      const res = await fetch(`/api/lk/${encodeURIComponent(token)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariff_id: tariffId }),
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
          <AlertCircle className="mx-auto h-10 w-10 text-[#991B1B]" strokeWidth={1.5} />
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
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#111827]">
            {data.family.parent_name}
          </h1>
        </div>

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
                              {lesson.lesson_type === 'group' ? 'Групповое' : 'Индивидуальное'} ·{' '}
                              {lesson.duration_minutes} мин
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
                            <button
                              type="button"
                              disabled={busyKey === `book-${lesson.id}`}
                              onClick={() => void handleBookLesson(lesson.id)}
                              className="min-h-[44px] cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#B05B20] active:scale-[0.98] disabled:opacity-60"
                            >
                              {busyKey === `book-${lesson.id}`
                                ? 'Запись...'
                                : `Записать (${activeChild?.name ?? ''})`}
                            </button>
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
                  Оплата через ЮKassa: доступна оплата по СБП и банковскими картами.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {data.tariffs.map((tariff) => (
                    <div
                      key={tariff.id}
                      className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4"
                    >
                      <div>
                        <div className="font-semibold text-[#111827]">{tariff.title}</div>
                        <div className="mt-1 text-xs text-[#6B7280] tabular-nums">
                          {pluralizeLessons(tariff.lessons_count)} · срок {tariff.validity_days} дн.
                        </div>
                        <div className="mt-3 font-display text-2xl font-bold text-[#111827] tabular-nums">
                          {formatMoney(tariff.price)}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busyKey === `pay-${tariff.id}`}
                        onClick={() => void handleStartPayment(tariff.id)}
                        className="mt-4 min-h-[44px] w-full cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#B05B20] active:scale-[0.98] disabled:opacity-60"
                      >
                        {busyKey === `pay-${tariff.id}` ? 'Создание платежа...' : 'Оплатить онлайн'}
                      </button>
                    </div>
                  ))}
                </div>

                {pendingCheckout && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
                    <div className="text-sm text-[#92400E]">
                      Счёт создан в ЮKassa. Откройте форму оплаты в новой вкладке и после оплаты
                      нажмите «Проверить оплату».
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={pendingCheckout.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#C86D2D] px-4 text-sm font-medium text-white hover:bg-[#B05B20]"
                      >
                        <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                        Перейти в ЮKassa
                      </a>
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
                            <a
                              href={payment.confirmation_url}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3.5 text-xs font-medium text-white hover:bg-[#B05B20]"
                            >
                              Завершить оплату
                            </a>
                          )}

                          {payment.receipt_url && (
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
                                onClick={() => {
                                  const name = payment.receipt_original_name || `Чек_${payment.id}`;
                                  const isPdf = name.toLowerCase().endsWith('.pdf');
                                  const base = `/api/files/receipts/${payment.id}?token=${encodeURIComponent(token)}`;
                                  setPreviewReceipt({
                                    name,
                                    inlineUrl: `${base}&inline=1`,
                                    downloadUrl: base,
                                    isPdf,
                                  });
                                }}
                                className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#ECFDF5] px-3.5 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
                              >
                                <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                                Открыть чек
                              </button>
                              <a
                                href={`/api/files/receipts/${payment.id}?token=${encodeURIComponent(
                                  token
                                )}`}
                                download={payment.receipt_original_name || 'receipt'}
                                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                              >
                                <Download className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                                Скачать чек
                              </a>
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
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div
              key="tab-notifications"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
                <h2 className="font-display text-base font-semibold text-[#111827]">
                  Уведомления в кабинете
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
                  href={previewReceipt.inlineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB]"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                  В новой вкладке
                </a>
                <a
                  href={previewReceipt.downloadUrl}
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
                  src={previewReceipt.inlineUrl}
                  title={previewReceipt.name}
                  className="h-[68vh] w-full rounded-xl border border-[#E5E7EB] bg-white"
                />
              ) : (
                <div className="flex items-center justify-center">
                  <img
                    src={previewReceipt.inlineUrl}
                    alt={previewReceipt.name}
                    className="max-h-[70vh] w-auto rounded-xl border border-[#E5E7EB] bg-white object-contain shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
