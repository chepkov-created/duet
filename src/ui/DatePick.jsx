// Own date pickers (the phone's built-in one can't block dates): a month calendar, a scroll wheel,
// the scheduled payment's «Однократно / Повторить» screen and the record's date-and-time sheet.
import { useState, useRef, useLayoutEffect } from 'preact/hooks';
import { Sheet, Segmented } from './kit.jsx';
import { dayStart, addDays } from '../data/format.js';
import { MONTHS_NOM, WEEK, UNITS, repeatText, alignStart, fullDate } from '../data/repeat.js';

const HEAD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** Month grid. Days before `min` / after `max` are greyed out and can't be picked. Calls onChange(Date at 00:00). */
export function Calendar({ value, onChange, min, max }) {
  const [view, setView] = useState(() => { const d = new Date(value || max || Date.now()); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const y = view.getFullYear(), m = view.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const minD = min ? dayStart(min) : null, maxD = max ? dayStart(max) : null;
  const sel = value ? dayStart(value).getTime() : null;
  const today = dayStart(new Date()).getTime();
  const canPrev = !minD || new Date(y, m, 1) > minD;
  const canNext = !maxD || new Date(y, m + 1, 1) <= maxD;
  return (
    <div class="cal">
      <div class="cal-head">
        <span class="cal-title">{MONTHS_NOM[m]} {y} г.</span>
        <button class="link cal-arrow" aria-label="Предыдущий месяц" disabled={!canPrev} onClick={() => setView(new Date(y, m - 1, 1))}>‹</button>
        <button class="link cal-arrow" aria-label="Следующий месяц" disabled={!canNext} onClick={() => setView(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div class="cal-grid">
        {HEAD.map((h) => <span key={h} class="cal-wd">{h}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(y, m, i + 1);
          const off = (minD && d < minD) || (maxD && d > maxD);
          const t = d.getTime();
          return (
            <button key={i} class={`cal-day${t === sel ? ' on' : ''}${t === today ? ' today' : ''}`} disabled={off}
              aria-label={fullDate(d)} aria-pressed={t === sel} onClick={() => onChange(d)}>{i + 1}</button>
          );
        })}
      </div>
    </div>
  );
}

/** iOS-like scroll wheel: items [[value, label]]. */
export function Wheel({ items, value, onChange, label }) {
  const H = 36;
  const ref = useRef(null);
  const timer = useRef(null);
  useLayoutEffect(() => { const i = Math.max(0, items.findIndex(([v]) => v === value)); if (ref.current) ref.current.scrollTop = i * H; }, []);
  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current; if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / H)));
      if (items[i][0] !== value) onChange(items[i][0]);
    }, 80);
  };
  return (
    <div class="wheel" ref={ref} onScroll={onScroll} role="listbox" aria-label={label}>
      <div style={{ height: H * 2 }} />
      {items.map(([v, l], i) => (
        <div key={v} role="option" aria-selected={v === value} class={`wheel-item${v === value ? ' on' : ''}`}
          onClick={() => { if (v !== value) onChange(v); ref.current.scrollTo({ top: i * H, behavior: 'smooth' }); }}>{l}</div>
      ))}
      <div style={{ height: H * 2 }} />
    </div>
  );
}

const NUMS = Array.from({ length: 30 }, (_, i) => [i + 1, String(i + 1)]);

/** «Дата и повтор» of a scheduled payment, like the original: Однократно (calendar) / Повторить (every N …, days, end date). */
export function RepeatPicker({ value, onDone, onClose }) {
  const today = dayStart(new Date());
  const [f, setF] = useState(() => ({
    date: value.date || '', repeat: value.repeat || 'none', every: value.every || 1,
    weekdays: value.weekdays?.length ? value.weekdays : [new Date(value.date || Date.now()).getDay()], until: value.until || '',
  }));
  const [unit, setUnit] = useState(f.repeat === 'none' ? 'monthly' : f.repeat);
  const [endOpen, setEndOpen] = useState(false);
  const mode = f.repeat === 'none' ? 'once' : 'repeat';
  const upd = (p) => setF((x) => ({ ...x, ...p }));
  const setDay = (d) => { d.setHours(12, 0, 0, 0); upd({ date: d.toISOString(), ...(f.until && dayStart(f.until) < d ? { until: '' } : {}) }); };
  const done = () => {
    if (!f.date) return;
    const out = { ...f, weekdays: f.repeat === 'weekly' ? f.weekdays : [] };
    if (f.repeat === 'none') { out.every = 1; out.until = ''; }
    out.date = alignStart(f.date, out);
    onDone(out);
  };
  const preview = { ...f, date: f.date || today.toISOString() };
  return (
    <Sheet title="Дата и повтор" onClose={onClose} left={<button class="link" onClick={onClose}>‹ Назад</button>}
      right={<button class="link strong" onClick={done} disabled={!f.date}>Готово</button>}>
      <div style={{ padding: '0 var(--s4) var(--s3)' }}>
        <Segmented light options={[['once', 'Однократно'], ['repeat', 'Повторить']]} value={mode}
          onChange={(m) => upd({ repeat: m === 'once' ? 'none' : unit })} />
      </div>
      {mode === 'repeat' && (
        <>
          <div class="note-box" style={{ margin: '0 var(--s4) var(--s3)' }}>{repeatText(preview)}</div>
          <div class="list">
            <div class="row"><span class="rl">Каждый</span><span class="rv" style={{ color: 'var(--accent)' }}>{f.every} {UNITS.find(([k]) => k === f.repeat)[1]}</span></div>
            <div class="wheels">
              <div class="wheel-band" aria-hidden="true" />
              <Wheel label="Каждые" items={NUMS} value={f.every} onChange={(every) => upd({ every })} />
              <Wheel label="Единица" items={UNITS} value={f.repeat} onChange={(r) => { setUnit(r); upd({ repeat: r }); }} />
            </div>
          </div>
          {f.repeat === 'weekly' && (
            <>
              <div class="group-label">Выберите дни</div>
              <div class="list"><div class="row week-days">
                {WEEK.map(([k, s]) => {
                  const on = f.weekdays.includes(k);
                  return <button key={k} class={on ? 'on' : ''} aria-pressed={on}
                    onClick={() => { const w = on ? f.weekdays.filter((x) => x !== k) : [...f.weekdays, k]; if (w.length) upd({ weekdays: w }); }}>{s}</button>;
                })}
              </div></div>
            </>
          )}
          <div class="group-label">{f.repeat === 'weekly' ? 'Начиная с' : 'Первый платёж'}</div>
        </>
      )}
      <div class="list" style={{ padding: 'var(--s2) var(--s3)' }}>
        <Calendar value={f.date} min={today} onChange={setDay} />
      </div>
      {mode === 'repeat' && (
        <>
          <div class="list" style={{ marginTop: 'var(--s5)' }}>
            <button class="row" onClick={() => setEndOpen(!endOpen)}><span class="rl">Дата окончания</span><span class="rv">{f.until ? fullDate(f.until) : 'Никогда'}</span><span class="chev" aria-hidden="true">›</span></button>
            {endOpen && (
              <div style={{ padding: 'var(--s2) var(--s3)' }}>
                <button class={`pill-btn${!f.until ? ' on' : ''}`} style={{ margin: '0 0 var(--s2) var(--s2)' }} onClick={() => { upd({ until: '' }); setEndOpen(false); }}>Никогда</button>
                <Calendar value={f.until} min={f.date || today} onChange={(d) => { d.setHours(23, 59, 0, 0); upd({ until: d.toISOString() }); setEndOpen(false); }} />
              </div>
            )}
          </div>
          <div class="muted" style={{ padding: 'var(--s2) var(--s4)', fontSize: 'var(--fs-s)' }}>Повторение будет завершено: {f.until ? fullDate(f.until) : 'никогда'}</div>
        </>
      )}
    </Sheet>
  );
}

const two = (n) => String(n).padStart(2, '0');

/** Date and time of a record: the calendar stops at today — money that hasn't moved yet is not a record. */
export function DateTimeSheet({ value, onDone, onClose }) {
  const [d, setD] = useState(() => new Date(value || Date.now()));
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const pickDay = (day) => { const x = new Date(day); x.setHours(d.getHours(), d.getMinutes(), 0, 0); setD(x); };
  const setTime = (t) => { const [h, m] = t.split(':').map(Number); if (Number.isNaN(h)) return; const x = new Date(d); x.setHours(h, m || 0, 0, 0); setD(x); };
  return (
    <Sheet short title="Дата и время" onClose={onClose} left={<button class="link" onClick={() => setD(new Date())}>Сбросить</button>}
      right={<button class="link strong" onClick={() => onDone(d.toISOString())}>Готово</button>}>
      <div class="list" style={{ padding: 'var(--s2) var(--s3)' }}>
        <Calendar value={d} max={new Date()} onChange={pickDay} />
      </div>
      <div class="list" style={{ marginTop: 'var(--s3)' }}>
        <label class="row"><span class="rl" style={{ fontWeight: 600 }}>Время</span><input type="time" value={time} onInput={(e) => setTime(e.currentTarget.value)} /></label>
      </div>
    </Sheet>
  );
}

/** "Сегодня, 09:14" / "Вчера, 21:03" / "12 ноября 2026 г., 10:00" */
export function dateTimeText(iso) {
  const d = new Date(iso);
  const t = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const today = dayStart(new Date()).getTime();
  const day = dayStart(d).getTime();
  if (day === today) return `Сегодня, ${t}`;
  if (day === addDays(today, -1).getTime()) return `Вчера, ${t}`;
  return `${fullDate(d)}, ${t}`;
}
