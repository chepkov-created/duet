const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 12 345,67 ₽ ; signed adds an explicit minus for negatives only */
export const rub = (n, { sign = false, cur = true } = {}) => {
  const v = money.format(Math.abs(n || 0)).replace(/ /g, ' ');
  const s = (n < 0 ? '-' : sign && n > 0 ? '+' : '') + v;
  return cur ? `${s} ₽` : s;
};

const SYM = { RUB: '₽', USD: '$', EUR: '€' };
/** Amount in any currency: 1 200,00 $ */
export const fmt = (n, cur = 'RUB', opts = {}) => (cur === 'RUB' || !cur ? rub(n, opts) : `${rub(n, { ...opts, cur: false })} ${SYM[cur] || cur}`);

export const shortK = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(Math.round(n));
};

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

export const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
export const sameDay = (a, b) => dayStart(a).getTime() === dayStart(b).getTime();

export const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = dayStart(new Date());
  if (sameDay(d, today)) return 'Сегодня';
  if (sameDay(d, addDays(today, -1))) return 'Вчера';
  const y = d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${y}`;
};

export const dayShort = (d) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`.toUpperCase();
export const ddmm = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
export const ddmmyyyy = (d) => `${ddmm(d)}.${d.getFullYear()}`;
export const timeHM = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const inDays = (iso) => {
  const n = Math.round((dayStart(iso) - dayStart(new Date())) / 864e5);
  if (n === 0) return 'Сегодня';
  if (n === 1) return 'Завтра';
  if (n < 0) return `Просрочено на ${-n} ${plural(-n, 'день', 'дня', 'дней')}`;
  return `Через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
};

export const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** value for <input type=datetime-local> in local time */
export const toLocalInput = (iso) => {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
