import { Download, Share, Smartphone, X } from 'lucide-react';
import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  variant?: 'nav' | 'cabinet';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'nav' }) => {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstructions, setShowInstructions] = useState(false);

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
    if (canInstall) {
      await install();
      return;
    }
    setShowInstructions(true);
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
        {isIOS ? (
          <Share className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
        ) : (
          <Download className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
        )}
        <span>{variant === 'cabinet' ? 'Закрепить на рабочий стол' : 'На экран'}</span>
      </button>

      {showInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Как закрепить приложение на экран"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#111827]">
                  Закрепить «Ясну» на рабочем столе
                </h3>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Кабинет родителя будет открываться как отдельное приложение в один тап.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                aria-label="Закрыть подсказку"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-xs leading-relaxed text-[#374151]">
                <li>
                  1. Откройте эту страницу в браузере <strong>Safari</strong> на iPhone/iPad.
                </li>
                <li>
                  2. Нажмите кнопку <strong>«Поделиться»</strong> (квадрат со стрелкой вверх) внизу
                  экрана.
                </li>
                <li>
                  3. Выберите пункт <strong>«На экран „Домой“»</strong> и нажмите{' '}
                  <strong>«Добавить»</strong>.
                </li>
                <li>
                  4. Запустите иконку «Ясна» с рабочего стола и включите push-уведомления внутри
                  кабинета.
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-xs leading-relaxed text-[#374151]">
                <li>
                  1. В браузере Chrome / Яндекс / Edge нажмите на меню (три точки или иконка
                  установки в адресной строке).
                </li>
                <li>
                  2. Выберите <strong>«Установить приложение»</strong> или{' '}
                  <strong>«Добавить на главный экран»</strong>.
                </li>
                <li>
                  3. После установки иконка «Ясна» появится на рабочем столе, а кабинет откроется
                  автоматически.
                </li>
              </ol>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="min-h-[40px] cursor-pointer rounded-xl bg-[#C86D2D] px-4 text-xs font-semibold text-white hover:bg-[#B05B20]"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
