/**
 * CORTEZ — PWA + إشعارات الويب
 * تُفعّل فقط إذا هيّأت الإدارة مفاتيح VAPID على الخادم.
 */

import { get, post } from './api.js';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    return registration;
  } catch (error) {
    console.warn('[Push] تعذّر تسجيل عامل الخدمة:', error.message);
    return null;
  }
}

function base64ToBytes(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

export async function pushStatus() {
  if (!pushSupported()) return { supported: false, enabled: false, subscribed: false };
  const config = await get('/api/push/key').catch(() => ({ enabled: false, key: '' }));
  let subscribed = false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (registration) {
      const existing = await registration.pushManager.getSubscription();
      subscribed = Boolean(existing);
    }
  } catch (error) {
    subscribed = false;
  }
  return {
    supported: true,
    enabled: Boolean(config.enabled && config.key),
    key: config.key || '',
    permission: Notification.permission,
    subscribed
  };
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('متصفحك لا يدعم إشعارات الويب');
  const status = await pushStatus();
  if (!status.enabled) throw new Error('الإشعارات غير مهيّأة على الخادم بعد');

  const registration = (await navigator.serviceWorker.getRegistration('/')) || (await initServiceWorker());
  if (!registration) throw new Error('تعذّر تجهيز عامل الخدمة');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم تمنح الإذن بالإشعارات');

  const ready = await navigator.serviceWorker.ready;
  const subscription =
    (await ready.pushManager.getSubscription()) ||
    (await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToBytes(status.key)
    }));

  await post('/api/push/subscribe', { subscription: subscription.toJSON() });
  return true;
}

export async function disablePush() {
  const ready = await navigator.serviceWorker.ready.catch(() => null);
  const subscription = ready ? await ready.pushManager.getSubscription() : null;
  if (subscription) {
    await post('/api/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => null);
    await subscription.unsubscribe().catch(() => null);
  }
  return false;
}

export async function sendTestPush() {
  return post('/api/push/test', {});
}
