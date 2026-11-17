import { shortK, ddmm } from '../data/format.js';

/** Donut from [{value, color, key}] */
export function Donut({ parts, size = 280, thickness = 44, center }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const gap = parts.length > 1 ? 2 : 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto' }} role="img" aria-label="Структура расходов">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" stroke-width={thickness} />
      {total > 0 && parts.map((p) => {
        const len = (p.value / total) * C;
        const el = (
          <circle key={p.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} stroke-width={thickness}
            stroke-dasharray={`${Math.max(len - gap, 0.5)} ${C}`} stroke-dashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        offset += len;
        return el;
      })}
      {center && (
        <foreignObject x={thickness} y={size / 2 - 40} width={size - thickness * 2} height="80">
          <div style={{ textAlign: 'center', color: 'var(--text)' }}>{center}</div>
        </foreignObject>
      )}
    </svg>
  );
}

/** Mini donut for tiles */
export const MiniDonut = ({ parts }) => <Donut parts={parts} size={64} thickness={9} />;

/** Area chart for a daily series [{date, value}] */
export function Area({ series, height = 220, mini = false }) {
  if (!series.length) return null;
  const W = 340, H = height, padL = mini ? 0 : 52, padB = mini ? 0 : 26, padT = mini ? 2 : 10;
  const vals = series.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo = mini ? lo : lo - span * 0.1;
  hi = hi + span * 0.08;
  const x = (i) => padL + (i / Math.max(series.length - 1, 1)) * (W - padL - 4);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  // smooth line via simple cardinal-ish curve
  const pts = series.map((p, i) => [x(i), y(p.value)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  const area = `${d} L${pts[pts.length - 1][0]},${H - padB} L${pts[0][0]},${H - padB} Z`;
  const ticks = mini ? [] : [0, 1, 2, 3].map((k) => lo + ((hi - lo) * (k + 0.5)) / 4);
  const xt = mini ? [] : [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.round(f * (series.length - 1)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={mini ? H : undefined} preserveAspectRatio={mini ? 'none' : undefined} role="img" aria-label="Динамика баланса" style={{ display: 'block' }}>
      {!mini && <rect x={padL} y={padT} width={W - padL - 4} height={H - padT - padB} fill="#131315" />}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="var(--text-3)" stroke-dasharray="5 5" stroke-width="0.8" />
          <text x={padL - 6} y={y(t) + 4} text-anchor="end" font-size="10" fill="var(--text-2)">{shortK(t)}</text>
        </g>
      ))}
      <path d={area} fill="rgba(10,132,255,0.28)" />
      <path d={d} fill="none" stroke="var(--accent)" stroke-width={mini ? 2 : 2.4} />
      {xt.map((i, k) => (
        <text key={k} x={x(i)} y={H - 8} text-anchor={k === 0 ? 'start' : k === xt.length - 1 ? 'end' : 'middle'} font-size="10" fill="var(--text-2)">
          {k === xt.length - 1 ? 'СЕГОДНЯ' : ddmm(series[i].date)}
        </text>
      ))}
    </svg>
  );
}

export function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div class="bar"><div style={{ width: `${pct}%`, background: color }} /></div>;
}
