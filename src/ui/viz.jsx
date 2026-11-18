// Interactive charts: a donut you can tap and drill into, bars by day, comparison lines.
import { useRef, useState, useLayoutEffect, useEffect } from 'preact/hooks';
import { shortK, ddmm, rub, addDays, dayStart } from '../data/format.js';

/* ---------- donut ---------- */
const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
function arc(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0), [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

/**
 * parts: [{key, name, value, color}]. selected: key or null. Tapping a slice selects it (others dim),
 * tapping it again calls onOpen(key). Tapping the middle clears the selection.
 */
export function PieDonut({ parts, selected, onSelect, onOpen, size = 260, totalLabel = 'Все' }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const c = size / 2, r1 = size / 2 - 8, r0 = r1 - 40;
  let a = -Math.PI / 2;
  const gap = parts.length > 1 ? 0.012 : 0;
  const sel = parts.find((p) => p.key === selected);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto', touchAction: 'pan-y' }} role="img" aria-label="Структура расходов">
      {total === 0 && <circle cx={c} cy={c} r={(r0 + r1) / 2} fill="none" stroke="var(--surface-2)" stroke-width={r1 - r0} />}
      {total > 0 && parts.map((p) => {
        const da = (p.value / total) * Math.PI * 2;
        const a0 = a + gap / 2, a1 = Math.max(a0 + 0.001, a + da - gap / 2);
        a += da;
        const on = p.key === selected;
        const grow = on ? 8 : 0;
        const d = parts.length === 1 ? null : arc(c, c, r0, r1 + grow, a0, a1);
        return (
          <g key={p.key} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); on ? onOpen?.(p.key) : onSelect?.(p.key); }}>
            {d ? <path d={d} fill={p.color} opacity={selected && !on ? 0.35 : 1} />
              : <circle cx={c} cy={c} r={(r0 + r1) / 2} fill="none" stroke={p.color} stroke-width={r1 - r0} opacity={1} />}
          </g>
        );
      })}
      <circle cx={c} cy={c} r={r0 - 2} fill="transparent" onClick={() => onSelect?.(null)} style={{ cursor: 'pointer' }} />
      <foreignObject x={c - r0 + 10} y={c - 42} width={(r0 - 10) * 2} height="84" style={{ pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center', color: 'var(--text)', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '84px' }}>
          <div style={{ fontSize: 15, lineHeight: 1.15, overflow: 'hidden', maxHeight: 36 }}>{sel ? sel.name : totalLabel}</div>
          <div class="num" style={{ fontWeight: 700, fontSize: 17, marginTop: 4 }}>{rub(sel ? sel.value : total)}</div>
          {sel && total > 0 && <div class="muted" style={{ fontSize: 12 }}>{Math.round((sel.value / total) * 100)}%</div>}
        </div>
      </foreignObject>
    </svg>
  );
}

/* ---------- bars by day ---------- */
/** days: [{date, values:[{v,color}]}] stacked; tap a bar shows its value */
export function DayBars({ days, height = 170, legend }) {
  const [hit, setHit] = useState(null);
  if (!days.length) return null;
  const W = 340, H = height, padL = 40, padB = 22, padT = 8;
  const totals = days.map((d) => d.values.reduce((a, x) => a + Math.abs(x.v), 0));
  const max = Math.max(1, ...totals) * 1.1;
  const bw = Math.max(1.5, ((W - padL - 4) / days.length) * 0.62);
  const x = (i) => padL + ((i + 0.5) / days.length) * (W - padL - 4);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => max / 1.1 * k);
  const step = Math.max(1, Math.round(days.length / 6));
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Суммы по дням">
        {ticks.map((t, k) => (
          <g key={k}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--text-3)" stroke-dasharray="3 4" stroke-width="0.6" />
            <text x={padL - 4} y={y(t) + 3} text-anchor="end" font-size="9" fill="var(--text-2)">{shortK(t)}</text></g>
        ))}
        {days.map((d, i) => {
          let acc = 0;
          return (
            <g key={i} onClick={() => setHit(hit === i ? null : i)} style={{ cursor: 'pointer' }}>
              <rect x={x(i) - (W - padL) / days.length / 2} y={padT} width={(W - padL) / days.length} height={H - padT - padB} fill="transparent" />
              {d.values.map((s, k) => {
                const v = Math.abs(s.v); if (!v) return null;
                const top = y(acc + v), bottom = y(acc); acc += v;
                return <rect key={k} x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1, bottom - top)} rx={Math.min(3, bw / 2)} fill={s.color} opacity={hit === null || hit === i ? 1 : 0.4} />;
              })}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="var(--text-3)" stroke-width="0.8" />
        {days.map((d, i) => (i % step === 0 ? <text key={i} x={x(i)} y={H - 6} text-anchor="middle" font-size="9" fill="var(--text-2)">{ddmm(d.date)}</text> : null))}
      </svg>
      {hit !== null && (
        <div class="chart-tip num">{rub(totals[hit])} · {ddmm(days[hit].date)}</div>
      )}
      {legend && <div class="chart-legend">{legend.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>}
    </div>
  );
}

/* ---------- lines ---------- */
/** series: [{name, color, points:[{date,value}], fill?}] — all share the x index; tap shows values */
export function Lines({ series, height = 200 }) {
  const [hit, setHit] = useState(null);
  const ref = useRef(null);
  const n = Math.max(...series.map((s) => s.points.length));
  if (!n) return null;
  const W = 340, H = height, padL = 44, padB = 22, padT = 10;
  const vals = series.flatMap((s) => s.points.map((p) => p.value));
  let lo = Math.min(0, ...vals), hi = Math.max(...vals, 1);
  const span = hi - lo || 1; hi += span * 0.08; lo -= lo < 0 ? span * 0.08 : 0;
  const x = (i) => padL + (i / Math.max(n - 1, 1)) * (W - padL - 4);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const ref0 = series[0].points;
  const step = Math.max(1, Math.round(n / 6));
  const pick = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * W;
    setHit(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / (W - padL - 4)) * (n - 1)))));
  };
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" onClick={pick} onTouchMove={pick} role="img" aria-label="График">
        {ticks.map((t, k) => (
          <g key={k}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--text-3)" stroke-dasharray="3 4" stroke-width="0.6" />
            <text x={padL - 4} y={y(t) + 3} text-anchor="end" font-size="9" fill="var(--text-2)">{shortK(t)}</text></g>
        ))}
        {series.map((s) => {
          if (!s.points.length) return null;
          const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
          return (
            <g key={s.name}>
              {s.fill && <path d={`${d} L${x(s.points.length - 1)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z`} fill={s.color} opacity="0.22" />}
              <path d={d} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" />
              {hit !== null && s.points[hit] && <circle cx={x(hit)} cy={y(s.points[hit].value)} r="3.5" fill={s.color} />}
            </g>
          );
        })}
        {hit !== null && <line x1={x(hit)} x2={x(hit)} y1={padT} y2={H - padB} stroke="var(--text-2)" stroke-dasharray="3 3" />}
        {ref0.map((p, i) => (i % step === 0 ? <text key={i} x={x(i)} y={H - 6} text-anchor="middle" font-size="9" fill="var(--text-2)">{ddmm(p.date)}</text> : null))}
      </svg>
      {hit !== null && (
        <div class="chart-tip num">
          {series.filter((s) => s.points[hit]).map((s) => <div key={s.name} style={{ color: s.color }}>{rub(s.points[hit].value)} · {ddmm(s.points[hit].date)}</div>)}
        </div>
      )}
      <div class="chart-legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}

/**
 * Real carousel: all pages sit side by side and the strip follows the finger.
 * Released past ~20 % of the width (or flicked) it glides to the next page, otherwise springs back.
 * Edges resist like iOS.
 */
export function Carousel({ page, onChange, pages, dots = true, dotLabel = 'Страница' }) {
  const wrap = useRef(null);
  const track = useRef(null);
  const st = useRef(null);
  const n = pages.length;
  const place = (dx, anim) => {
    const el = track.current; if (!el) return;
    el.style.transition = anim ? 'transform 0.32s cubic-bezier(0.22, 0.8, 0.25, 1)' : 'none';
    el.style.transform = `translate3d(calc(${-page * 100}% + ${dx}px), 0, 0)`;
  };
  useLayoutEffect(() => { place(0, true); }, [page, n]);
  const ts = (e) => { const t = e.touches[0]; if (t.clientX < 28) return; // the left edge belongs to «back»
    st.current = { x: t.clientX, y: t.clientY, t: Date.now(), dx: 0, h: null }; };
  const tm = (e) => {
    const s = st.current; if (!s) return;
    const t = e.touches[0]; const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (s.h === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) s.h = Math.abs(dx) > Math.abs(dy);
    if (!s.h) return;
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    const edge = (page === 0 && dx > 0) || (page === n - 1 && dx < 0);
    s.dx = edge ? dx / 3 : dx; // rubber band at the ends
    place(s.dx, false);
  };
  const te = () => {
    const s = st.current; st.current = null; if (!s || !s.h) return;
    const w = wrap.current?.clientWidth || 300;
    const v = Math.abs(s.dx) / Math.max(1, Date.now() - s.t); // px per ms
    let next = page;
    if (Math.abs(s.dx) > w * 0.2 || (v > 0.45 && Math.abs(s.dx) > 20)) next = Math.max(0, Math.min(n - 1, page + (s.dx < 0 ? 1 : -1)));
    if (next !== page) onChange(next); else place(0, true);
  };
  // touchmove must be non-passive to stop the page from scrolling sideways
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    el.addEventListener('touchmove', tm, { passive: false });
    return () => el.removeEventListener('touchmove', tm);
  });
  return (
    <div>
      <div ref={wrap} class="carousel" onTouchStart={ts} onTouchEnd={te} onTouchCancel={te}>
        <div ref={track} class="carousel-track">
          {pages.map((pg, i) => <div key={i} class="carousel-page" aria-hidden={i !== page}>{pg}</div>)}
        </div>
      </div>
      {dots && n > 1 && (
        <div class="pager" style={{ justifyContent: 'center', display: 'flex' }}>
          {pages.map((_, i) => <button key={i} aria-label={`${dotLabel} ${i + 1}`} class={page === i ? 'on' : ''} onClick={() => onChange(i)}><i /></button>)}
        </div>
      )}
    </div>
  );
}

/** Day list between two dates (inclusive), capped for long periods by grouping into weeks/months. */
export function dayBuckets(from, to) {
  const days = Math.round((dayStart(to) - dayStart(from)) / 864e5) + 1;
  const size = days > 400 ? 30 : days > 120 ? 7 : 1;
  const out = [];
  for (let d = dayStart(from); d <= to; d = addDays(d, size)) out.push({ start: d, end: new Date(addDays(d, size).getTime() - 1) });
  return out;
}
