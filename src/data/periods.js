import { addDays, addMonths, dayStart, dayShort, ddmmyyyy } from './format.js';
import { signed, accountBalance, toRub } from './store.js';
import { category } from './categories.js';

// period: {kind:'rolling', key} | {kind:'cal', unit, offset} | {kind:'range', from, to}
export const ROLLING = [['7d', '7 дней'], ['30d', '30 дней'], ['12w', '12 недель'], ['6m', '6 месяцев'], ['1y', '1 год']];
export const CAL_UNITS = [['day', 'Сегодня'], ['week', 'Эта неделя'], ['month', 'Этот месяц'], ['year', 'Этот год']];

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

export function periodRange(p) {
  const today = dayStart(new Date());
  if (p.kind === 'rolling') {
    const to = endOfToday();
    const from = {
      '7d': addDays(today, -6), '30d': addDays(today, -29), '12w': addDays(today, -83),
      '6m': addMonths(today, -6), '1y': addMonths(today, -12),
    }[p.key];
    const label = { '7d': 'Последние 7 дней', '30d': 'Последние 30 дней', '12w': 'Последние 12 недель', '6m': 'Последние 6 месяцев', '1y': 'Последний год' }[p.key];
    return { from, to, label, prev: shiftBack(from, to) };
  }
  if (p.kind === 'cal') {
    let from, to;
    const o = p.offset || 0;
    if (p.unit === 'day') { from = addDays(today, o); to = addDays(from, 1); }
    if (p.unit === 'week') { const dow = (today.getDay() + 6) % 7; from = addDays(today, -dow + 7 * o); to = addDays(from, 7); }
    if (p.unit === 'month') { from = new Date(today.getFullYear(), today.getMonth() + o, 1); to = new Date(today.getFullYear(), today.getMonth() + o + 1, 1); }
    if (p.unit === 'year') { from = new Date(today.getFullYear() + o, 0, 1); to = new Date(today.getFullYear() + o + 1, 0, 1); }
    to = new Date(to.getTime() - 1);
    const prevFrom = p.unit === 'month' ? new Date(from.getFullYear(), from.getMonth() - 1, 1) : p.unit === 'year' ? new Date(from.getFullYear() - 1, 0, 1) : addDays(from, p.unit === 'week' ? -7 : -1);
    return { from, to, label: calLabel(p.unit, o, from, to), prev: { from: prevFrom, to: new Date(from.getTime() - 1) } };
  }
  const from = dayStart(p.from), to = new Date(dayStart(p.to).getTime() + 864e5 - 1);
  return { from, to, label: `${dayShort(from)} – ${dayShort(to)}`, prev: shiftBack(from, to) };
}

const shiftBack = (from, to) => { const len = to - from; return { from: new Date(from.getTime() - len - 1), to: new Date(from.getTime() - 1) }; };

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
function calLabel(unit, o, from, to) {
  if (o === 0) return CAL_UNITS.find(([u]) => u === unit)[1];
  if (unit === 'day') return o === -1 ? 'Вчера' : ddmmyyyy(from);
  if (unit === 'week') return `${dayShort(from)} – ${dayShort(to)}`;
  if (unit === 'month') return `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  return String(from.getFullYear());
}

export const inRange = (r, { from, to }) => { const d = new Date(r.date); return d >= from && d <= to && r.status !== 'planned'; };

export function totals(records, range) {
  let income = 0, expense = 0, nIn = 0, nOut = 0;
  for (const r of records) {
    if (!inRange(r, range)) continue;
    if (r.type === 'income') { income += r.amount; nIn++; }
    if (r.type === 'expense') { expense += r.amount; nOut++; }
  }
  return { income, expense, flow: income - expense, nIn, nOut };
}

/** sums by category id and by group id for one type */
export function byCategory(records, range, type = 'expense') {
  const cats = {}, groups = {};
  for (const r of records) {
    if (r.type !== type || !inRange(r, range)) continue;
    const c = category(r.categoryId);
    cats[c.id] = (cats[c.id] || 0) + r.amount;
    groups[c.group] = (groups[c.group] || 0) + r.amount;
  }
  return { cats, groups };
}

export function byOwner(records, range, type = 'expense') {
  const out = {};
  for (const r of records) {
    if (r.type !== type || !inRange(r, range)) continue;
    const keys = [r.owner || 'Без метки', ...(r.labels || [])];
    for (const k of keys) out[k] = (out[k] || 0) + r.amount;
  }
  return out;
}

/** % change vs previous; returns null when there is nothing to compare */
export const change = (cur, prev) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 100) : null);

/** daily total balance across given accounts for the last `days` days */
export function balanceSeries(accounts, records, days = 30) {
  const today = dayStart(new Date());
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const end = new Date(d.getTime() + 864e5 - 1);
    out.push({ date: d, value: accounts.reduce((s, a) => s + toRub(accountBalance(a, records, end), a.currency), 0) });
  }
  return out;
}

export { signed };
