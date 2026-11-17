// Shake the phone to bring back the last deleted record (iPhone asks once for motion access).
import { useEffect, useState } from 'preact/hooks';
import { useStore, updateSettings, lastDeleted, undoDelete } from '../data/store.js';
import { category } from '../data/categories.js';
import { rub } from '../data/format.js';

const needsPermission = () => typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';

/** Mounted once in App: listens for a shake while the setting is on. */
export function ShakeListener({ toast }) {
  const s = useStore();
  useEffect(() => {
    if (!s.settings.shakeUndo || typeof window === 'undefined') return;
    let last = null, hits = 0, firstHit = 0, busy = false;
    const on = (e) => {
      const a = e.accelerationIncludingGravity; if (!a) return;
      if (last) {
        const d = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
        const now = Date.now();
        if (d > 28) { if (now - firstHit > 900) { hits = 0; firstHit = now; } hits++; }
        if (hits >= 3 && !busy) {
          hits = 0; busy = true;
          const d0 = lastDeleted();
          setTimeout(() => {
            if (!d0) toast('Нечего восстанавливать');
            else {
              const it = d0.item;
              const what = d0.collection === 'records' ? `${it.type === 'transfer' ? 'Перевод' : category(it.categoryId).name} на ${rub(it.amount)}` : (it.name || 'объект');
              if (confirm(`Восстановить удалённое?\n${what}`)) { undoDelete(); toast('Восстановлено'); }
            }
            setTimeout(() => { busy = false; }, 1200);
          }, 50);
        }
      }
      last = { x: a.x || 0, y: a.y || 0, z: a.z || 0 };
    };
    window.addEventListener('devicemotion', on);
    return () => window.removeEventListener('devicemotion', on);
  }, [s.settings.shakeUndo]);
  return null;
}

export function ShakeSettings() {
  const s = useStore();
  const [err, setErr] = useState('');
  const on = s.settings.shakeUndo;
  const toggle = async () => {
    setErr('');
    if (on) { updateSettings({ shakeUndo: false }); return; }
    try {
      if (needsPermission()) {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') throw new Error('Доступ к датчику движения не разрешён.');
      }
      updateSettings({ shakeUndo: true });
    } catch (e) { setErr(e.message || String(e)); }
  };
  return (
    <>
      <div class="group-label">Отмена удаления</div>
      <div class="list inset plain">
        <button class="row" role="switch" aria-checked={Boolean(on)} onClick={toggle}>
          <span class="rl">Встряхнуть, чтобы восстановить<span class="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>последняя удалённая запись вернётся после подтверждения</span></span>
          <span class={`toggle${on ? ' on' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {err && <div class="error-box" role="alert">{err}</div>}
    </>
  );
}
