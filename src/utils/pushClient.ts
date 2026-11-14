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

let cachedClientVapidKey: string | null = null;

function getEnvVapidPublicKey(): string {
  const raw = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  return typeof raw === 'string' ? raw.trim() : '';
}

function isValidVapidPublicKey(key: string): boolean {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{60,120}$/.test(key.trim());
}

export async function fetchServerVapidPublicKey(
  token?: string | null
): Promise<{ publicKey?: string; error?: string }> {
  if (cachedClientVapidKey && isValidVapidPublicKey(cachedClientVapidKey)) {
    return { publicKey: cachedClientVapidKey };
  }

  const envKey = getEnvVapidPublicKey();
  if (envKey && isValidVapidPublicKey(envKey)) {
    cachedClientVapidKey = envKey;
    return { publicKey: envKey };
  }

  // 1. Primary: query public /api/push/vapid-public-key endpoint
  try {
    const res = await fetch('/api/push/vapid-public-key', {
      headers: { 'X-Request-Id': generateSecureCorrelationId() },
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { publicKey?: string };
      if (data.publicKey && isValidVapidPublicKey(data.publicKey)) {
        cachedClientVapidKey = data.publicKey.trim();
        return { publicKey: cachedClientVapidKey };
      }
    }
  } catch (err) {
    console.warn('[PushClient] Ошибка обращения к /api/push/vapid-public-key:', err);
  }

  // 2. Secondary fallback: query family token endpoint if token is provided
  if (token) {
    try {
      const tokenRes = await fetch(`/api/lk/${encodeURIComponent(token)}/push/vapid-public-key`, {
        headers: { 'X-Request-Id': generateSecureCorrelationId() },
      });
      if (tokenRes.ok) {
        const data = (await tokenRes.json().catch(() => ({}))) as { publicKey?: string };
        if (data.publicKey && isValidVapidPublicKey(data.publicKey)) {
          cachedClientVapidKey = data.publicKey.trim();
          return { publicKey: cachedClientVapidKey };
        }
      }
    } catch (err) {
      console.warn('[PushClient] Ошибка обращения к эндпоинту ЛК:', err);
    }
  }

  return { error: 'Не удалось получить публичный VAPID-ключ для push-уведомлений' };
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
  } catch (err) {
    console.warn('[PushClient] Ошибка проверки подписки push:', err);
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

    const { publicKey, error } = await fetchServerVapidPublicKey(token);
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

    if (!token) {
      return {
        ok: true,
        message:
          'Уведомления успешно разрешены на этом устройстве! Откройте персональную ссылку семьи, чтобы связать напоминания с вашим расписанием.',
      };
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
  } catch (err) {
    console.error('[PushClient] Ошибка оформления push-подписки:', err);
    return {
      ok: false,
      message:
        'Не удалось включить push-уведомления. Убедитесь, что сайт открыт по HTTPS или с рабочего стола.',
    };
  }
}
