import api from './axios';

// Push notifications on this device (staff only). Turning them on must start from a tap.

const quiet = { skipErrorToast: true };

export const pushSupported = () => typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
/** iPhone/iPad only allow notifications from the Home Screen app, not from Safari. */
export const needsHomeScreenApp = () => isIos() && !isInstalled();

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js');
}

function keyBytes(base64) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** 'unsupported' | 'install' (iPhone in Safari) | 'denied' | 'on' | 'off' */
export async function pushState() {
  if (needsHomeScreenApp()) return 'install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush() {
  const { data } = await api.get('/push/public-key', quiet);
  const publicKey = data?.data?.publicKey;
  if (!publicKey) throw new Error('Notifications are not set up on the server yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked for this app. Allow them in your phone settings.' : 'Notifications were not allowed.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api.post('/push/subscribe', { subscription: sub.toJSON() }, quiet);
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }, quiet).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** On sign-out: this device stops receiving the signed-out person's notifications. Never blocks sign-out. */
export function disablePushOnSignOut() {
  if (!pushSupported()) return Promise.resolve();
  return Promise.race([disablePush().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1500))]);
}

export const sendTestPush = () => api.post('/push/test', {}, quiet);
