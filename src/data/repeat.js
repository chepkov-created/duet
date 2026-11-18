// Repeat rules of scheduled payments: once, or every N days / weeks (on chosen weekdays) / months / years, until a date.
// Stored on the payment: repeat ('none'|'daily'|'weekly'|'monthly'|'yearly'), every (N, default 1), weekdays ([0..6], Sunday = 0), until (ISO or empty).
import { addDays, addMonths, dayStart, plural } from './format.js';

export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
/** Monday first, like the calendar: [weekday number, short name, "по …" form] */
export const WEEK = [[1, 'Пн', 'понедельникам'], [2, 'Вт', 'вторникам'], [3, 'Ср', 'средам'], [4, 'Чт', 'четвергам'], [5, 'Пт', 'пятницам'], [6, 'Сб', 'субботам'], [0, 'Вс', 'воскресеньям']];
export const UNITS = [['daily', 'День'], ['weekly', 'Неделя'], ['monthly', 'Месяц'], ['yearly', 'Год']];
const FORMS = { daily: ['день', 'дня', 'дней'], weekly: ['неделю', 'недели', 'недель'], monthly: ['месяц', 'месяца', 'месяцев'], yearly: ['год', 'года', 'лет'] };
const EVERY1 = { daily: 'Каждый день', weekly: 'Каждую неделю', monthly: 'Каждый месяц', yearly: 'Каждый год' };

const monday = (t) => { const z = dayStart(t); z.setDate(z.getDate() - ((z.getDay() + 6) % 7)); return z; };
export const fullDate = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()} г.`; };

/** Next occurrence after `iso`, or null when the payment does not repeat or the end date has passed. */
export function nextDate(iso, repeat, x = {}) {
  const every = Math.max(1, Number(x.every) || 1);
  const d = new Date(iso);
  let n = null;
  if (repeat === 'daily') n = addDays(d, every);
  else if (repeat === 'weekly') {
    const wd = x.weekdays?.length ? x.weekdays : [d.getDay()];
    const base = monday(d);
    for (let i = 1; i <= 7 * every + 7; i++) {
      const c = addDays(d, i);
      const wk = Math.round((monday(c) - base) / (7 * 864e5));
      if (wd.includes(c.getDay()) && wk % every === 0) { n = c; break; }
    }
  } else if (repeat === 'monthly') n = addMonths(d, every);
  else if (repeat === 'yearly') n = addMonths(d, 12 * every);
  if (!n) return null;
  if (x.until && dayStart(n) > dayStart(x.until)) return null;
  return n.toISOString();
}

/** First date that fits the weekdays (a weekly payment on Mon/Wed can't start on a Friday). */
export function alignStart(iso, x) {
  if (x.repeat !== 'weekly' || !x.weekdays?.length) return iso;
  const d = new Date(iso);
  for (let i = 0; i < 7; i++) { const c = addDays(d, i); if (x.weekdays.includes(c.getDay())) return c.toISOString(); }
  return iso;
}

export function everyText(repeat, every = 1) {
  const n = Math.max(1, Number(every) || 1);
  if (n === 1) return EVERY1[repeat] || 'Один раз';
  const [a, b, c] = FORMS[repeat];
  return `Каждые ${n} ${plural(n, a, b, c)}`;
}

/** "Каждый месяц, 19-го" / "Каждые 2 недели по пн, ср" / "Каждый год, 19 ноября · до 1 мая 2027 г." / "Один раз" */
export function repeatText(x) {
  if (!x.repeat || x.repeat === 'none') return 'Один раз';
  const d = new Date(x.date || Date.now());
  let t = everyText(x.repeat, x.every);
  if (x.repeat === 'monthly') t += `, ${d.getDate()}-го`;
  if (x.repeat === 'yearly') t += `, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (x.repeat === 'weekly') {
    const wd = x.weekdays?.length ? x.weekdays : [d.getDay()];
    const days = WEEK.filter(([k]) => wd.includes(k));
    t += days.length === 1 ? ` по ${days[0][2]}` : ` по ${days.map(([, s]) => s.toLowerCase()).join(', ')}`;
  }
  if (x.until) t += ` · до ${fullDate(x.until)}`;
  return t;
}
