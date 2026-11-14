function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function generateSecureCorrelationId(): string {
  if (typeof window !== 'undefined' && window.crypto) {
    if (typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Web Crypto API недоступен в текущем окружении');
}

function getEnvVapidPublicKey(): string {
  const raw = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  return typeof raw === 'string' ? raw.trim() : '';
}

function isValidVapidPublicKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{60,120}$/.test(key);
}

async function resolveVapidPublicKey(token: string): Promise<{ publicKey?: string; error?: string }> {
  const envKey = getEnvVapidPublicKey();
  if (envKey) {
    if (!isValidVapidPublicKey(envKey)) {
      return { error: 'Некорректный формат VITE_VAPID_PUBLIC_KEY в конфигурации окружения' };
    }
    return { publicKey: envKey };
  }

  const keyRes = await fetch(`/api/lk/${encodeURIComponent(token)}/push/vapid-public-key`, {
    headers: {
      'X-Request-Id': generateSecureCorrelationId(),
    },
  });
  const keyBody = (await keyRes.json().catch(() => ({}))) as { publicKey?: string; error?: string };
  if (!keyRes.ok || !keyBody.publicKey || !isValidVapidPublicKey(keyBody.publicKey)) {
    return {
      error: keyBody.error || 'Не удалось получить ключ push-сервера',
    };
  }
  return { publicKey: keyBody.publicKey };
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export async function getDevicePushStatus(): Promise<{
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}> {
  const supported = isPushSupported();
  if (!supported) {
    return { supported: false, permission: 'default', subscribed: false };
  }
  const permission = Notification.permission;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return { supported: true, permission, subscribed: Boolean(sub) };
  } catch {
    return { supported: true, permission, subscribed: false };
  }
}

export async function subscribeFamilyPush(
  token: string | null | undefined
): Promise<{ ok: boolean; message: string }> {
  if (!isPushSupported()) {
    return {
      ok: false,
      message:
        'Этот браузер пока не поддерживает push-уведомления. На iPhone сначала закрепите сайт на экран «Домой» в Safari и откройте иконку.',
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        message:
          'Доступ к уведомлениям отклонён в настройках браузера. Разрешите уведомления для «Ясна» и попробуйте снова.',
      };
    }

    if (!token) {
      return {
        ok: true,
        message:
          'Разрешение на уведомления выдано! Откройте ваш личный кабинет по персональной ссылке, чтобы привязать уведомления к вашей семье.',
      };
    }

    const { publicKey, error } = await resolveVapidPublicKey(token);
    if (!publicKey) {
      return {
        ok: false,
        message: error || 'Не удалось получить ключ push-сервера',
      };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const subJson = subscription.toJSON();
    const subRes = await fetch(`/api/lk/${encodeURIComponent(token)}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': generateSecureCorrelationId(),
      },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }),
    });

    if (!subRes.ok) {
      const errBody = (await subRes.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        message: errBody.error || 'Не удалось зарегистрировать устройство для уведомлений',
      };
    }

    return {
      ok: true,
      message:
        'Уведомления на это устройство включены: будут приходить чеки об оплате, подтверждения записи, отметки посещаемости и напоминания перед занятиями.',
    };
  } catch {
    return {
      ok: false,
      message:
        'Не удалось включить push-уведомления. Убедитесь, что сайт открыт по HTTPS или с рабочего стола.',
    };
  }
}
