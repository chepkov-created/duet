// iPhone notifications: this phone subscribes, the subscription goes into the shared ledger ("devices"),
// and the daily robot in duet-data sends reminders to every device of that person.
import { useState } from 'preact/hooks';
import { useStore, alive, upsert, remove, getState } from '../data/store.js';
import { VAPID_PUBLIC } from '../data/vapid.js';

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const idOf = async (endpoint) => {
  const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(endpoint));
  return 'dev' + [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function PushSettings() {
  const s = useStore();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = s.settings.me;
  const mine = alive(s.ledger.devices || []).filter((d) => d.person === me);
  const thisId = s.settings.pushDeviceId;
  const enabledHere = thisId && mine.some((d) => d.id === thisId) && typeof Notification !== 'undefined' && Notification.permission === 'granted';

  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      if (!pushSupported()) throw new Error(standalone() ? 'Этот iPhone не поддерживает уведомления: нужна iOS 16.4 или новее.' : 'Откройте «Дуэт» с экрана «Домой» (не в Safari) — только там iPhone разрешает уведомления.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Уведомления запрещены. Включите их: Настройки iPhone → Уведомления → Дуэт.');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) }));
      const json = sub.toJSON();
      const id = await idOf(json.endpoint);
      upsert('devices', { id, person: me, endpoint: json.endpoint, keys: json.keys, ua: navigator.userAgent.slice(0, 80), createdAt: Date.now() });
      const { updateSettings } = await import('../data/store.js');
      updateSettings({ pushDeviceId: id });
      await reg.showNotification('Дуэт', { body: 'Уведомления включены. Напоминания о платежах будут приходить в 9:00.', icon: './icon-180.png' });
      setMsg({ ok: 'Включено. Пришло тестовое уведомление — значит, всё работает.' });
    } catch (e) {
      setMsg({ err: e.message || String(e) });
    } finally { setBusy(false); }
  };

  const disable = async () => {
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); await sub?.unsubscribe(); } catch { /* ignore */ }
    if (thisId) remove('devices', thisId);
    setMsg({ ok: 'Уведомления на этом телефоне выключены.' });
  };

  return (
    <>
      <div class="group-label">Уведомления на iPhone</div>
      <div class="list inset plain">
        <div class="row"><span class="rl">На этом телефоне</span><span class="rv">{enabledHere ? 'Включены' : 'Выключены'}</span></div>
        {!enabledHere
          ? <button class="row" onClick={enable} disabled={busy}><span class="rl accent">{busy ? 'Включаю…' : 'Включить уведомления'}</span></button>
          : <button class="row" onClick={disable}><span class="rl" style={{ color: 'var(--neg-text)' }}>Выключить на этом телефоне</span></button>}
      </div>
      {msg?.ok && <div class="note-box" style={{ color: 'var(--pos-text)' }}>✓ {msg.ok}</div>}
      {msg?.err && <div class="error-box" role="alert">{msg.err}</div>}
      <div class="note-box">Каждый день в 9:00 приходят напоминания: платёж сегодня или завтра, просроченный платёж, бюджет почти исчерпан. Нужна iOS 16.4+, и «Дуэт» должен быть открыт с экрана «Домой». Включите на каждом телефоне отдельно.</div>
    </>
  );
}

export { getState };
