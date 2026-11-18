// PIN of a person's profile: set / change it, and the lock screen when this phone becomes that person.
import { useState } from 'preact/hooks';
import { Sheet, PERSON_COLOR } from './kit.jsx';
import { useStore, upsert, updateSettings, reopenSecrets, profileOf, PEOPLE } from '../data/store.js';
import { makeProfile, unlockProfile, forgetKey, storedKeyFor } from '../data/crypto.js';

const okPin = (p) => /^\d{4,8}$/.test(p);

function PinField({ value, onInput, label, autoFocus, onEnter }) {
  return (
    <label class="pin-field">
      <span class="sr-only">{label}</span>
      <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} placeholder={label} autoFocus={autoFocus}
        value={value} onInput={(e) => onInput(e.currentTarget.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && onEnter?.()} />
    </label>
  );
}

/** Set or change the PIN of this phone's person. */
export function PinSetup({ onClose, onDone }) {
  const s = useStore();
  const me = s.settings.me;
  const had = Boolean(profileOf(me, s));
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!okPin(a)) return setErr('PIN — от 4 до 8 цифр');
    if (a !== b) return setErr('PIN-коды не совпадают');
    setBusy(true);
    const profile = await makeProfile(me, a);
    upsert('profiles', profile);
    await reopenSecrets();
    setBusy(false);
    onDone?.();
    onClose();
  };
  return (
    <Sheet short title={had ? 'Новый PIN' : 'PIN для профиля'} onClose={onClose}
      footer={<button class="btn primary" disabled={busy || !a || !b} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить PIN'}</button>}>
      <div class="note-box">
        PIN нужен, чтобы стать «{me}» на любом телефоне, и им шифруются ваши «Секреты». {PEOPLE.find((p) => p !== me)} не сможет ни переключиться на ваш профиль, ни прочитать секреты — даже в общем файле на GitHub.
      </div>
      <div class="note-box" style={{ color: 'var(--warn)' }}>Запомните PIN: без него секреты на новом телефоне не открыть.</div>
      <div style={{ display: 'grid', gap: 10, padding: '0 var(--s4)' }}>
        <PinField label="Придумайте PIN (4–8 цифр)" value={a} onInput={(v) => { setA(v); setErr(''); }} autoFocus />
        <PinField label="Повторите PIN" value={b} onInput={(v) => { setB(v); setErr(''); }} onEnter={save} />
      </div>
      {err && <div class="error-box" role="alert">{err}</div>}
    </Sheet>
  );
}

/** Full-screen lock: this phone is set to a person with a PIN, but their key isn't here yet. */
export function PinGate() {
  const s = useStore();
  const me = s.settings.me;
  const profile = profileOf(me, s);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me || !profile || storedKeyFor(me)) return null;
  const go = async () => {
    if (!pin) return;
    setBusy(true);
    const ok = await unlockProfile(profile, pin);
    setBusy(false);
    if (!ok) { setErr('Неверный PIN'); setPin(''); return; }
    await reopenSecrets();
    updateSettings({ unlockedAt: Date.now() }); // re-render: the key is now on this phone
  };
  return (
    <div class="pin-gate" role="dialog" aria-modal="true" aria-label={`Вход в профиль ${me}`}>
      <div style={{ fontSize: 44 }} aria-hidden="true">🔒</div>
      <h1 style={{ margin: 0 }}><span style={{ color: PERSON_COLOR[me] }}>●</span> {me}</h1>
      <div class="muted" style={{ textAlign: 'center', maxWidth: 300 }}>Введите PIN профиля, чтобы открыть его на этом телефоне.</div>
      <PinField label="PIN" value={pin} onInput={(v) => { setPin(v); setErr(''); }} autoFocus onEnter={go} />
      {err && <div class="error-box" role="alert" style={{ margin: 0 }}>{err}</div>}
      <button class="btn primary" style={{ maxWidth: 320 }} disabled={busy || !pin} onClick={go}>{busy ? 'Проверяю…' : 'Войти'}</button>
      {PEOPLE.filter((p) => p !== me).map((p) => (
        <button key={p} class="link" onClick={() => switchPerson(p)}>Я не {me} — я {p}</button>
      ))}
    </div>
  );
}

/** Change who uses this phone. The previous person's key is removed from the phone, so coming back needs their PIN. */
export function switchPerson(person) {
  forgetKey();
  updateSettings({ me: person, view: person });
}
