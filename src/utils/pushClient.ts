const VAPID_PUBLIC_KEY_ENDPOINT = '/api/push/vapid-public-key';
const PUSH_SUBSCRIBE_ENDPOINT = '/api/push/subscribe';

function sanitizeBase64Url(rawValue: unknown, minLen = 24, maxLen = 128): string {
  if (typeof rawValue !== 'string') return '';
  const trimmed = rawValue.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) return '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    const isAlphanumeric =
      (code >= 48 && code <= 57) || // 0-9
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122); // a-z
    const isSpecial = code === 45 || code === 95; // - or _
    if (!isAlphanumeric && !isSpecial) return '';
  }
  return trimmed;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const sanitized = sanitizeBase64Url(base64String, 60, 120);
  if (!sanitized) {
    throw new Error('Некорректный формат VAPID-ключа');
  }
  const padding = '='.repeat((4 - (sanitized.length % 4)) % 4);
  const base64 = (sanitized + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

let cachedClientVapidKey: string | null = null;

export async function fetchServerVapidPublicKey(): Promise<{
  publicKey?: string;
  error?: string;
}> {
  if (cachedClientVapidKey) {
    return { publicKey: cachedClientVapidKey };
  }

  try {
    const res = await fetch(VAPID_PUBLIC_KEY_ENDPOINT, {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { publicKey?: string };
      const validKey = sanitizeBase64Url(data.publicKey, 60, 120);
      if (validKey) {
        cachedClientVapidKey = validKey;
        return { publicKey: validKey };
      }
    }
  } catch (err) {
    console.warn('[PushClient] Ошибка обращения к серверу за VAPID-ключом:', err);
  }

  return { error: 'Не удалось получить публичный ключ сервера уведомлений' };
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

    const { publicKey, error } = await fetchServerVapidPublicKey();
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

    const safeToken = sanitizeBase64Url(token, 24, 128);
    if (!safeToken) {
      return {
        ok: false,
        message: 'Некорректный формат токена доступа семьи',
      };
    }

    const subJson = subscription.toJSON();
    const subRes = await fetch(PUSH_SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: safeToken,
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
