import { useRef, useState } from 'preact/hooks';
import { Sheet, Row } from './kit.jsx';
import { useStore, updateSettings, alive, filterCount } from '../data/store.js';
import { FilterSheet } from './Filter.jsx';
import { accLabel } from './Accounts.jsx';
import { ROLLING, CAL_UNITS, periodRange } from '../data/periods.js';
import { dayStart, addDays } from '../data/format.js';

const DEFAULT = { kind: 'cal', unit: 'month', offset: 0 };
export const usePeriod = () => {
  const s = useStore();
  const p = s.settings.period || DEFAULT;
  return [p, (period) => updateSettings({ period }), periodRange(p)];
};

const dateVal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

/** Bottom dock with three pages: rolling windows, calendar stepper, custom range. */
export function PeriodDock({ bottom = 'calc(var(--tabbar-h) + var(--safe-b))' }) {
  const [p, setP, range] = usePeriod();
  const pageOf = p.kind === 'rolling' ? 0 : p.kind === 'cal' ? 1 : 2;
  const [page, setPage] = useState(pageOf);
  const [units, setUnits] = useState(false);
  const [open, setOpen] = useState(false);      // expanded: accounts + filter rows
  const [filterOpen, setFilterOpen] = useState(null); // 'accounts' | 'cats'
  const s = useStore();
  const f = s.settings.filter || {};
  const accounts = alive(s.ledger.accounts);
  const accValue = !f.accounts?.length ? 'Все' : f.accounts.length === 1 ? accLabel(accounts.find((a) => a.id === f.accounts[0])) : `${f.accounts.length} счёта`;
  const catValue = [f.type === 'income' ? 'Доходы' : f.type === 'expense' ? 'Расходы' : '', f.cats?.length ? `${f.cats.length} кат.` : '', f.labels?.length ? `${f.labels.length} мет.` : ''].filter(Boolean).join(' · ') || 'Все';
  const active = filterCount(f);

  // Swipe left/right on the panel switches the three pages; drag the handle up/down to open/close.
  const touch = useRef(null);
  const onStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) setPage((pg) => Math.max(0, Math.min(2, pg + (dx < 0 ? 1 : -1))));
  };
  return (
    <div class={`period-dock${open ? ' open' : ''}`} style={{ bottom }} onTouchStart={onStart} onTouchEnd={onEnd}>

      {page === 0 && (
        <div class="seg" role="tablist" aria-label="Период">
          {ROLLING.map(([k, l]) => (
            <button key={k} class={p.kind === 'rolling' && p.key === k ? 'on' : ''} onClick={() => setP({ kind: 'rolling', key: k })}>{l}</button>
          ))}
        </div>
      )}
      {page === 1 && (
        <div class="stepper">
          <button aria-label="Предыдущий период" onClick={() => setP({ ...(p.kind === 'cal' ? p : DEFAULT), offset: ((p.kind === 'cal' && p.offset) || 0) - 1 })}>‹</button>
          <button class="mid" onClick={() => setUnits(true)}>{p.kind === 'cal' ? range.label : 'Выбрать период'} ▾</button>
          <button aria-label="Следующий период" disabled={p.kind === 'cal' && p.offset >= 0} onClick={() => setP({ ...(p.kind === 'cal' ? p : DEFAULT), offset: Math.min(0, ((p.kind === 'cal' && p.offset) || 0) + 1) })}>›</button>
        </div>
      )}
      {page === 2 && (
        <div class="range">
          <label class="sr-only" for="pf">С</label>
          <input id="pf" type="date" value={dateVal(p.kind === 'range' ? p.from : addDays(new Date(), -6))} max={dateVal(new Date())}
            onInput={(e) => e.currentTarget.value && setP({ kind: 'range', from: new Date(e.currentTarget.value).toISOString(), to: p.kind === 'range' ? p.to : dayStart(new Date()).toISOString() })} />
          <span style={{ color: 'var(--accent)' }}>–</span>
          <label class="sr-only" for="pt">По</label>
          <input id="pt" type="date" value={dateVal(p.kind === 'range' ? p.to : new Date())}
            onInput={(e) => e.currentTarget.value && setP({ kind: 'range', from: p.kind === 'range' ? p.from : addDays(new Date(), -6).toISOString(), to: new Date(e.currentTarget.value).toISOString() })} />
        </div>
      )}
      <div class="dock-foot">
        <span />
        <div class="pager" role="tablist" aria-label="Способ выбора периода">
          {['Скользящий период', 'Календарный период', 'Свои даты'].map((l, i) => (
            <button key={i} aria-label={l} class={page === i ? 'on' : ''} onClick={() => setPage(i)}><i /></button>
          ))}
        </div>
        <button class="dock-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          Фильтры{active ? <span class="count-badge">{active}</span> : ''} {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <div class="dock-more">
          <Row label="Счета" value={accValue} onClick={() => setFilterOpen('accounts')} />
          <Row label="Категории" value={catValue} onClick={() => setFilterOpen('cats')} />
        </div>
      )}
      {filterOpen && <FilterSheet section={filterOpen} onClose={() => setFilterOpen(null)} />}
      {units && (
        <Sheet short title="Период" onClose={() => setUnits(false)}>
          <div class="list option-list">
            {CAL_UNITS.map(([u, l]) => <Row key={u} label={l} chevron={false} value={p.kind === 'cal' && p.unit === u ? '✓' : ''} onClick={() => { setP({ kind: 'cal', unit: u, offset: 0 }); setUnits(false); }} />)}
          </div>
        </Sheet>
      )}
    </div>
  );
}
