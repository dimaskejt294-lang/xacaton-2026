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

    const keyRes = await fetch(`/api/lk/${encodeURIComponent(token)}/push/vapid-public-key`);
    const keyBody = (await keyRes.json()) as { publicKey?: string; error?: string };
    if (!keyRes.ok || !keyBody.publicKey) {
      return {
        ok: false,
        message: keyBody.error || 'Не удалось получить ключ push-сервера',
      };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyBody.publicKey),
      });
    }

    const subJson = subscription.toJSON();
    const subRes = await fetch(`/api/lk/${encodeURIComponent(token)}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
