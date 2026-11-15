import { BellRing, CheckCircle2, Download, Share, Smartphone, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { getDevicePushStatus, subscribeFamilyPush } from '../utils/pushClient.ts';
import { BrandLogo } from './BrandLogo.tsx';

interface PWAInstallButtonProps {
  variant?: 'nav' | 'cabinet';
  familyToken?: string | null;
  onPushEnabled?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'nav',
  familyToken,
  onPushEnabled,
}) => {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [modalMode, setModalMode] = useState<'none' | 'instructions' | 'push-prompt'>('none');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void getDevicePushStatus().then((status) => {
      setPushSupported(status.supported);
      setPushSubscribed(status.subscribed);
    });
  }, [familyToken, modalMode]);

  if (isInstalled) {
    if (variant === 'cabinet') {
      return (
        <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-3.5 text-xs font-semibold text-[#065F46]">
          <Smartphone className="h-3.5 w-3.5" strokeWidth={1.75} />
          Закреплено как приложение
        </span>
      );
    }
    return null;
  }

  const handleClick = async () => {
    setPushFeedback(null);
    const status = await getDevicePushStatus();
    setPushSupported(status.supported);
    setPushSubscribed(status.subscribed);

    if (canInstall) {
      await install();
      if (status.supported && !status.subscribed) {
        setModalMode('push-prompt');
      }
      return;
    }

    setModalMode('instructions');
  };

  const handleEnableNotificationsNow = async () => {
    setPushBusy(true);
    setPushFeedback(null);
    const result = await subscribeFamilyPush(familyToken);
    setPushBusy(false);
    setPushFeedback({ ok: result.ok, text: result.message });
    if (result.ok) {
      setPushSubscribed(true);
      onPushEnabled?.();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={
          variant === 'cabinet'
            ? 'inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-semibold text-[#111827] shadow-sm transition-colors hover:bg-[#F9FAFB]'
            : 'inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-semibold text-[#111827] transition-colors hover:bg-[#F3F4F6]'
        }
        title="Закрепить мастерскую «Ясна» на рабочем столе телефона или компьютера"
      >
        <BrandLogo variant="red" className="h-5 w-5 rounded-full" />
        {isIOS ? (
          <Share className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
        ) : (
          <Download className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
        )}
        <span>{variant === 'cabinet' ? 'Закрепить на рабочий стол' : 'На экран'}</span>
      </button>

      {modalMode !== 'none' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-3 whitespace-normal sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Закрепить приложение и включить уведомления"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setModalMode('none');
              }
            }}
          >
            <div className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-4 break-words whitespace-normal shadow-xl sm:max-w-md sm:p-6">
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex min-w-0 items-start gap-3">
                  <BrandLogo variant="red" className="h-11 w-11 shrink-0 rounded-full sm:h-12 sm:w-12" />
                  <div className="min-w-0">
                    <h3 className="font-display text-base leading-snug font-bold text-[#111827] sm:text-lg">
                      {modalMode === 'push-prompt'
                        ? 'Включить уведомления на устройство?'
                        : 'Закрепить «Ясну» на рабочем столе'}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                      {modalMode === 'push-prompt'
                        ? 'Чтобы сразу получать чеки об оплате, подтверждения записи, отметки посещения и напоминания за 24 часа до занятия.'
                        : 'Личный кабинет будет открываться с иконкой «Ясна» как отдельное приложение в один тап.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  aria-label="Закрыть окно"
                  className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB]"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              {modalMode === 'instructions' && (
                <>
                  {isIOS ? (
                    <ol className="mt-4 space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3.5 text-xs leading-relaxed text-[#374151]">
                      <li>
                        1. Откройте эту страницу в браузере <strong>Safari</strong> на iPhone или
                        iPad.
                      </li>
                      <li>
                        2. Нажмите кнопку <strong>«Поделиться»</strong> (квадрат со стрелкой вверх)
                        внизу экрана.
                      </li>
                      <li>
                        3. Пролистайте меню и выберите <strong>«На экран „Домой“»</strong>, затем
                        нажмите <strong>«Добавить»</strong>.
                      </li>
                      <li>
                        4. На рабочем столе появится иконка с логотипом «Ясна» — откройте её и
                        разрешите уведомления.
                      </li>
                    </ol>
                  ) : (
                    <ol className="mt-4 space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3.5 text-xs leading-relaxed text-[#374151]">
                      <li>
                        1. В браузере Chrome / Яндекс / Safari нажмите на меню браузера (три точки
                        или кнопку «Поделиться»).
                      </li>
                      <li>
                        2. Выберите <strong>«Установить приложение»</strong> или{' '}
                        <strong>«Добавить на главный экран»</strong>.
                      </li>
                      <li>
                        3. На рабочем столе телефона появится иконка с логотипом «Ясна».
                      </li>
                    </ol>
                  )}
                </>
              )}

              {/* Offer to enable notifications right away */}
              <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#FDF4ED] p-3.5 sm:p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
                  <BellRing className="h-4 w-4 shrink-0 text-[#C86D2D]" strokeWidth={1.75} />
                  <span>Уведомления о занятиях и чеках</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                  {pushSubscribed
                    ? 'Push-уведомления уже включены на этом устройстве.'
                    : pushSupported
                      ? 'Разрешите уведомления, чтобы получать чеки, напоминания за 24 ч и отметки «посетил / пропустил».'
                      : 'На iPhone/iPad кнопка включения уведомлений появится сразу после запуска закреплённой иконки «Ясна» с экрана «Домой».'}
                </p>

                {pushFeedback && (
                  <div
                    className={`mt-2.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                      pushFeedback.ok
                        ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                        : 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                    }`}
                  >
                    {pushFeedback.text}
                  </div>
                )}

                {pushSupported && !pushSubscribed && (
                  <button
                    type="button"
                    disabled={pushBusy}
                    onClick={() => void handleEnableNotificationsNow()}
                    className="mt-3 inline-flex min-h-[40px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C86D2D] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#B05B20] disabled:opacity-60"
                  >
                    <BellRing className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                    <span>{pushBusy ? 'Подключение...' : 'Включить уведомления сейчас'}</span>
                  </button>
                )}

                {pushSubscribed && (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#065F46]">
                    <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span>Уведомления активны</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  className="min-h-[40px] w-full cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-4 text-xs font-semibold text-[#111827] hover:bg-[#F9FAFB] sm:w-auto"
                >
                  {modalMode === 'push-prompt' && !pushSubscribed ? 'Позже' : 'Понятно'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
