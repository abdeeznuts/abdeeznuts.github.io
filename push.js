// Phone alerts through the phone's own push service (no app store needed).
// Customers get booking updates (confirmed, ready to pay, documents); the team gets new
// requests and payments. On iPhone this works once Uniworld is added to the Home Screen.
const b64u = (buf) => { if (!buf) return ''; let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64u = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0)); };
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'ready' | 'on' | 'install' (iPhone: add to Home Screen first) | 'unsupported'. A blocked
// permission shows up when asking (the browser answers 'denied' without a prompt).
export function alertsState(role) {
  if (!supported()) return isIOS() && !standalone() ? 'install' : 'unsupported';
  try { if (Notification.permission === 'granted' && localStorage.getItem('uniworld:alerts-' + role) === '1') return 'on'; } catch { /* storage optional */ }
  return 'ready';
}

export const ALERT_HELP = {
  install: 'On iPhone, first add Uniworld to your Home Screen: tap Share, then Add to Home Screen. Open Uniworld from there and turn on alerts.',
  blocked: 'Alerts are blocked for Uniworld. Allow notifications for this app in your phone’s settings, then try again.',
  unsupported: 'This browser can’t show alerts. Try Chrome or Safari, or add Uniworld to your Home Screen.',
};

export async function turnOnAlerts(api, role, headers) {
  const state = alertsState(role);
  if (state === 'install' || state === 'unsupported') throw new Error(ALERT_HELP[state]);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(ALERT_HELP.blocked);
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('push/key');
  let sub = await reg.pushManager.getSubscription();
  if (sub && b64u(sub.options?.applicationServerKey) !== publicKey) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) });
  await api(role === 'staff' ? 'staff/push' : 'push', 'POST', { subscription: sub.toJSON() }, headers);
  try { localStorage.setItem('uniworld:alerts-' + role, '1'); } catch { /* optional */ }
  return true;
}

export async function turnOffAlerts(api, role, headers) {
  const reg = supported() ? await navigator.serviceWorker.ready : null;
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) await api(role === 'staff' ? 'staff/push' : 'push', 'POST', { subscription: sub.toJSON(), off: true }, headers);
  try { localStorage.removeItem('uniworld:alerts-' + role); } catch { /* optional */ }
}
