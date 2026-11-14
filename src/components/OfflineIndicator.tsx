import { WifiOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-xs font-medium text-[#92400E] shadow-lg"
    >
      <WifiOff className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span>Нет подключения к интернету. Некоторые действия станут доступны после восстановления сети.</span>
    </div>
  );
};
