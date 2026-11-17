import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { category } from '../data/categories.js';
import { rub, fmt, dayLabel, inDays } from '../data/format.js';

export const PERSON_COLOR = { 'Миша': 'var(--p-misha)', 'Арина': 'var(--p-arina)' };

/* ---------- icons (drawn here) ---------- */
export const Svg = {
  home: (p) => (<svg viewBox="0 0 26 26" {...p}><path d="M13 2 3 9.5V23h20V9.5z" fill="currentColor" /><text x="13" y="20" text-anchor="middle" font-size="12" font-weight="800" fill="var(--bg)">₽</text></svg>),
  clock: (p) => (<svg viewBox="0 0 26 26" {...p}><circle cx="13" cy="14" r="10" fill="none" stroke="currentColor" stroke-width="2.4" /><path d="M13 8v6l4 2" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" /><path d="M19 2.5l3 3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>),
  bars: (p) => (<svg viewBox="0 0 26 26" {...p}><rect x="3" y="14" width="5" height="10" rx="1" fill="currentColor" /><rect x="10.5" y="9" width="5" height="15" rx="1" fill="currentColor" /><rect x="18" y="3" width="5" height="21" rx="1" fill="currentColor" /></svg>),
  more: (p) => (<svg viewBox="0 0 26 26" {...p}><circle cx="13" cy="13" r="12" fill="currentColor" /><circle cx="7.5" cy="13" r="1.8" fill="var(--bg)" /><circle cx="13" cy="13" r="1.8" fill="var(--bg)" /><circle cx="18.5" cy="13" r="1.8" fill="var(--bg)" /></svg>),
  plus: (p) => (<svg viewBox="0 0 24 24" {...p}><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>),
  back: (p) => (<svg viewBox="0 0 12 20" width="12" height="20" {...p}><path d="M10 2 2 10l8 8" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>),
  gear: (p) => (<svg viewBox="0 0 24 24" width="26" height="26" {...p}><path fill="currentColor" d="M13.9 2l.5 2.6a8 8 0 0 1 2 1.1l2.5-.9 1.9 3.3-2 1.7a8 8 0 0 1 0 2.4l2 1.7-1.9 3.3-2.5-.9a8 8 0 0 1-2 1.1l-.5 2.6h-3.8l-.5-2.6a8 8 0 0 1-2-1.1l-2.5.9-1.9-3.3 2-1.7a8 8 0 0 1 0-2.4l-2-1.7 1.9-3.3 2.5.9a8 8 0 0 1 2-1.1l.5-2.6zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" /></svg>),
  camera: (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...p}><path fill="currentColor" d="M8.5 4h7l1.6 2.2H21a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.2a1 1 0 0 1 1-1h3.9zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /></svg>),
};

/* ---------- layout ---------- */
export function Screen({ title, back, onBack, left, right, pushed, children, noLarge }) {
  const ref = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = pushed ? ref.current : window;
    const on = () => setScrolled((pushed ? ref.current.scrollTop : window.scrollY) > 40);
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [pushed]);
  return (
    <div class={`screen${pushed ? ' pushed' : ''}`} ref={ref}>
      <header class={`nav${scrolled || noLarge ? ' scrolled' : ''}`}>
        <div class="nav-bar">
          <div class="slot">
            {back && (
              <button class="back" onClick={onBack} aria-label={`Назад: ${back}`}>
                <Svg.back /> <span>{back}</span>
              </button>
            )}
            {left}
          </div>
          <div class="nav-small-title">{title}</div>
          <div class="slot right">{right}</div>
        </div>
      </header>
      {!noLarge && <h1 class="large-title">{title}</h1>}
      {children}
    </div>
  );
}

export function Card({ title, children, onMore, menu }) {
  return (
    <section class="card">
      {title && (
        <div class="card-head">
          <h2 class="card-title">{title}</h2>
          {menu}
        </div>
      )}
      {children}
      {onMore && (
        <div class="more-link"><button onClick={onMore}>Показать всё</button></div>
      )}
    </section>
  );
}

export function Sheet({ title, onClose, left, right, children, footer, short }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);
  // Rendered into <body> so no panel (period dock, tab bar) can cover it.
  return createPortal((
    <div class="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={`sheet${short ? ' short' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head">
          <div class="slot">{left !== undefined ? left : <button class="link" onClick={onClose}>Отмена</button>}</div>
          <h2>{title}</h2>
          <div class="slot right">{right}</div>
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  ), document.body);
}

export const Segmented = ({ options, value, onChange, light }) => (
  <div class={`seg${light ? ' light' : ''}`} role="tablist">
    {options.map(([v, label]) => (
      <button key={v} role="tab" aria-selected={value === v} class={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
    ))}
  </div>
);

export const Empty = ({ icon, text, children }) => (
  <div class="empty"><div class="big-ico" aria-hidden="true">{icon}</div><b>{text}</b>{children}</div>
);

export function CatIcon({ catId, owner, size }) {
  const c = category(catId);
  const st = { background: c.color };
  if (size) Object.assign(st, { width: size, height: size, fontSize: size * 0.45 });
  return (
    <span class="cat-ico" style={st} aria-hidden="true">
      {c.icon}
      {owner && <span class="who-dot" style={{ background: PERSON_COLOR[owner] || 'var(--surface-3)' }}>{owner[0]}</span>}
    </span>
  );
}

export function RecordRow({ r, accounts, onClick, scheduled }) {
  const c = category(r.categoryId);
  const acc = accounts.find((a) => a.id === r.accountId);
  const to = accounts.find((a) => a.id === r.toAccountId);
  const isTransfer = r.type === 'transfer';
  const title = scheduled ? r.name || c.name : isTransfer ? 'Перевод' : c.name;
  const sign = r.type === 'expense' ? -1 : r.type === 'income' ? 1 : 0;
  const name = (a) => (a ? (a.owner ? `${a.name} ${a.owner === 'Миша' ? 'М' : 'А'}` : a.name) : '?');
  const shown = r.orig ? fmt(sign * r.orig.amount || r.orig.amount, r.orig.currency) : fmt(sign * r.amount || r.amount, acc?.currency);
  const toShown = isTransfer && r.toAmount != null && to?.currency && to.currency !== acc?.currency ? ` → ${fmt(r.toAmount, to.currency)}` : '';
  return (
    <button class="rec" onClick={onClick}>
      {isTransfer ? <span class="cat-ico" style={{ background: 'var(--surface-3)' }} aria-hidden="true">⇄</span> : <CatIcon catId={r.categoryId} owner={r.owner} />}
      <div class="rec-main">
        <div class="rec-title">{title}</div>
        {scheduled && <div class="rec-title" style={{ fontSize: 'var(--fs-m)' }}>{c.name}</div>}
        <div class="rec-sub">{isTransfer ? `${name(acc)} → ${name(to)}` : name(acc)}{r.owner && !scheduled ? ` · ${r.owner}` : ''}</div>
        {(r.payee || r.note) && <div class="rec-sub">{[r.payee, r.note].filter(Boolean).join(' · ')}</div>}
      </div>
      <div class="rec-side">
        <span class={`amt num ${sign < 0 ? 'neg' : sign > 0 ? 'pos' : ''}`}>{shown}{toShown}</span>
        <span class="muted">{scheduled ? inDays(r.date) : dayLabel(r.date)}</span>
        {(scheduled || r.status === 'planned') && <span class="pill warn">Запланировано</span>}
        {r.secretFrom && <span class="muted" title={`Секрет от ${r.secretFrom}`}>🤫 секрет</span>}
        {(r.items || []).length > 0 && <span class="muted">🧾 {r.items.length} поз.</span>}
      </div>
    </button>
  );
}

export function Menu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button class="dots" aria-label="Действия" aria-expanded={open} onClick={() => setOpen(!open)}>•••</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: 30, zIndex: 31, background: 'var(--surface-2)', borderRadius: 'var(--r-m)', minWidth: 200, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
            {items.map(([label, fn]) => (
              <button key={label} class="row" style={{ minHeight: 44 }} onClick={() => { setOpen(false); fn(); }}>{label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Row({ icon, label, value, onClick, chevron = true, children, valueClass }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag class="row" onClick={onClick}>
      {icon !== undefined && <span class="ri" aria-hidden="true">{icon}</span>}
      <span class="rl">{label}</span>
      {children}
      {value !== undefined && <span class={`rv ${valueClass || ''}`}>{value}</span>}
      {onClick && chevron && <span class="chev" aria-hidden="true">›</span>}
    </Tag>
  );
}
