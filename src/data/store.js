import { useEffect, useState } from 'preact/hooks';
import { readLedger, writeLedger } from './github.js';
import { uid } from './format.js';
import { applyCategoryEdits, natureOfRecord } from './categories.js';
import { sealMine, openMine, isLocked } from './crypto.js';

const LEDGER_KEY = 'duet.ledger';
const SETTINGS_KEY = 'duet.settings';
// `categories` holds the family's renames/new/hidden categories; it syncs like everything else.
// `profiles`: each person's PIN-locked key (see crypto.js).
const COLLECTIONS = ['accounts', 'records', 'scheduled', 'budgets', 'templates', 'categories', 'devices', 'profiles'];

export const PEOPLE = ['Миша', 'Арина'];

// Fixed ids, so both phones start with the same accounts and merge cleanly.
const A = (id, name, kind, owner, color, currency = 'RUB', group) => ({ id, name, kind, owner, color, currency, group, initial: 0, updatedAt: 0 });
export const DEFAULT_ACCOUNTS = [
  A('misha-cash', 'Наличные', 'cash', 'Миша', 'var(--acc-red)'),
  A('misha-psb', 'ПСБ Твой Банк', 'bank', 'Миша', 'var(--acc-psb)'),
  A('misha-psb2', 'ПСБ Зарплатная', 'bank', 'Миша', 'var(--acc-psb)'),
  A('misha-sber', 'Сбер', 'bank', 'Миша', 'var(--acc-sber)'),
  A('misha-tbank', 'Т-Банк', 'bank', 'Миша', 'var(--acc-tbank)'),
  A('misha-ozon', 'Озон', 'bank', 'Миша', 'var(--acc-ozon)'),
  A('arina-cash', 'Наличные', 'cash', 'Арина', 'var(--acc-red)'),
  A('arina-sber', 'Сбер', 'bank', 'Арина', 'var(--acc-sber)'),
  A('arina-tbank', 'Т-Банк', 'bank', 'Арина', 'var(--acc-tbank)'),
  A('arina-ozon', 'Озон', 'bank', 'Арина', 'var(--acc-ozon)'),
  A('pillow-rub', 'Подушка ₽', 'savings', '', 'var(--acc-gold)', 'RUB', 'Подушка'),
  A('pillow-usd', 'Подушка $', 'savings', '', 'var(--acc-gold)', 'USD', 'Подушка'),
  A('pillow-eur', 'Подушка €', 'savings', '', 'var(--acc-gold)', 'EUR', 'Подушка'),
];

const emptyLedger = () => ({
  schema: 1,
  accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
  records: [],
  scheduled: [],
  budgets: [],
  templates: [],
  categories: [],
  devices: [],
  profiles: [],
});

const defaultSettings = () => ({
  me: '',
  view: 'all', // all | <person>
  ghOwner: '', ghRepo: '', ghToken: '', ghPath: 'ledger.json',
  hidePromo: false,
  filter: { accounts: [], cats: [], labels: [] },
  rates: { USD: 0, EUR: 0, at: 0, manual: false }, // rubles per unit
});

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback(), ...JSON.parse(raw) } : fallback();
  } catch { return fallback(); }
};
const persist = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

let state = {
  ledger: load(LEDGER_KEY, emptyLedger),
  settings: load(SETTINGS_KEY, defaultSettings),
  sync: { status: 'idle', at: null, error: null }, // idle | syncing | ok | error | off
};
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(state));
const set = (patch) => {
  // Category edits from either phone: rebuild the tree before screens re-render.
  if (patch.ledger && patch.ledger.categories !== state.ledger.categories) applyCategoryEdits(live(patch.ledger.categories || []));
  state = { ...state, ...patch };
  emit();
};
applyCategoryEdits((state.ledger.categories || []).filter((x) => !x.deleted));

export const getState = () => state;
export function useStore() {
  const [s, setS] = useState(state);
  useEffect(() => { listeners.add(setS); setS(state); return () => listeners.delete(setS); }, []);
  return s;
}

/* ---------- currencies ---------- */
export const CURRENCIES = { RUB: '₽', USD: '$', EUR: '€' };
export const accCurrency = (accountId, s = state) => s.ledger.accounts.find((a) => a.id === accountId)?.currency || 'RUB';
export const rate = (cur, s = state) => (cur === 'RUB' || !cur ? 1 : Number(s.settings.rates?.[cur]) || 0);
export const toRub = (amount, cur, s = state) => amount * rate(cur, s);

/** Rates from the Central Bank (free, no key), at most once every 6 hours unless set by hand. */
export async function refreshRates(force = false) {
  const r = state.settings.rates || {};
  if (r.manual && !force) return;
  if (!force && r.at && Date.now() - r.at < 6 * 3600e3) return;
  try {
    const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', { cache: 'no-store' });
    const j = await res.json();
    updateSettings({ rates: { USD: j.Valute.USD.Value, EUR: j.Valute.EUR.Value, at: Date.now(), manual: false } });
  } catch { /* offline: keep the last known rates */ }
}

/* ---------- settings ---------- */
export function updateSettings(patch) {
  const settings = { ...state.settings, ...patch };
  persist(SETTINGS_KEY, settings);
  set({ settings });
}

export const syncConfigured = (s = state.settings) => Boolean(s.ghOwner && s.ghRepo && s.ghToken && s.ghPath);

/* ---------- ledger mutations ---------- */
// The other person's sealed secrets are not records for this phone at all: no list, no total, no balance.
const live = (arr) => (arr || []).filter((x) => !x.deleted && !isLocked(x));
export const alive = live;

function commit(ledger) {
  persist(LEDGER_KEY, ledger);
  set({ ledger });
  scheduleSync();
}

export function upsert(collection, item) {
  const now = Date.now();
  const list = state.ledger[collection] || [];
  const next = { ...item, id: item.id || uid(), updatedAt: now, by: state.settings.me || undefined };
  const idx = list.findIndex((x) => x.id === next.id);
  const copy = idx >= 0 ? list.map((x, i) => (i === idx ? next : x)) : [...list, next];
  commit({ ...state.ledger, [collection]: copy });
  return next;
}

export function upsertMany(collection, items) {
  const now = Date.now();
  const map = new Map((state.ledger[collection] || []).map((x) => [x.id, x]));
  for (const it of items) {
    const next = { ...it, id: it.id || uid(), updatedAt: now, by: state.settings.me || undefined };
    map.set(next.id, next);
  }
  commit({ ...state.ledger, [collection]: [...map.values()] });
}

// What was deleted on this phone, newest last: shake or "Отменить" brings it back.
const UNDO_KEY = 'duet.undo';
const undoStack = (() => { try { return JSON.parse(localStorage.getItem(UNDO_KEY) || '[]'); } catch { return []; } })();
const saveUndo = () => persist(UNDO_KEY, undoStack.slice(-30));
export const lastDeleted = () => undoStack[undoStack.length - 1] || null;
export function undoDelete() {
  const d = undoStack.pop();
  if (!d) return null;
  saveUndo();
  upsert(d.collection, { ...d.item, deleted: undefined });
  return d;
}

export function remove(collection, id) {
  const now = Date.now();
  const before = state.ledger[collection].find((x) => x.id === id);
  if (before && !before.deleted) { undoStack.push({ collection, item: before, at: now }); if (undoStack.length > 30) undoStack.shift(); saveUndo(); }
  // Tombstone, so the deletion reaches the other phone through sync.
  const copy = state.ledger[collection].map((x) => (x.id === id ? { id, deleted: true, updatedAt: now } : x));
  commit({ ...state.ledger, [collection]: copy });
}

export function replaceLedger(ledger) {
  const now = Date.now();
  const stamped = { schema: 1 };
  for (const c of COLLECTIONS) stamped[c] = (ledger[c] || []).map((x) => ({ ...x, updatedAt: x.updatedAt || now }));
  commit(stamped);
}

/* ---------- merge ---------- */
export function mergeLedgers(a, b) {
  const out = { schema: 1 };
  for (const c of COLLECTIONS) {
    const map = new Map();
    for (const x of [...(a?.[c] || []), ...(b?.[c] || [])]) {
      const prev = map.get(x.id);
      if (!prev || (x.updatedAt || 0) > (prev.updatedAt || 0)) map.set(x.id, x);
    }
    out[c] = [...map.values()];
  }
  return out;
}

const sameLedger = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- sync ---------- */
let timer = null;
let running = null;
let pending = false;

export function scheduleSync(delay = 1500) {
  if (!syncConfigured()) { if (state.sync.status !== 'off') set({ sync: { status: 'off', at: null, error: null } }); return; }
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

export async function syncNow() {
  if (!syncConfigured()) { set({ sync: { status: 'off', at: null, error: null } }); return; }
  if (running) { pending = true; return running; }
  const s = state.settings;
  const cfg = { owner: s.ghOwner.trim(), repo: s.ghRepo.trim(), token: s.ghToken.trim(), path: s.ghPath.trim() || 'ledger.json' };
  set({ sync: { ...state.sync, status: 'syncing', error: null } });
  running = (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: remote, sha } = await readLedger(cfg);
      const merged = mergeLedgers(remote, state.ledger);
      merged.records = await openMine(merged.records, s.me); // my own secrets: readable again on my phone
      if (!sameLedger(merged, state.ledger)) { persist(LEDGER_KEY, merged); set({ ledger: merged }); }
      // What goes to the shared file: my secrets sealed with my key.
      const out = { ...merged, records: await sealMine(merged.records, s.me) };
      if (remote && sameLedger(mergeLedgers(remote, {}), out)) return; // nothing new to push
      try {
        await writeLedger(cfg, out, sha, `${s.me || 'устройство'}: обновление ${new Date().toLocaleString('ru-RU')}`);
        return;
      } catch (e) {
        if (e.status === 409 || e.status === 422) continue; // someone wrote in between: re-read and merge again
        throw e;
      }
    }
    throw new Error('Не удалось записать: файл постоянно меняется. Попробуйте ещё раз.');
  })();
  try {
    await running;
    set({ sync: { status: 'ok', at: Date.now(), error: null } });
  } catch (e) {
    // No network is normal: records stay on the phone and go out when the connection returns.
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || e instanceof TypeError;
    set({ sync: offline ? { status: 'offline', at: state.sync.at, error: null } : { status: 'error', at: state.sync.at, error: e.message || String(e) } });
  } finally {
    running = null;
    if (pending) { pending = false; scheduleSync(300); }
  }
}

/* ---------- derived ---------- */
// type: all | expense | income | transfer; transfers: with | without; status: all | done | planned; currencies: ['RUB', 'USD', …]
export const EMPTY_FILTER = { accounts: [], cats: [], labels: [], type: 'all', natures: [], transfers: 'with', status: 'all', currencies: [] };
export const filterCount = (f = state.settings.filter) => (f?.accounts?.length || 0) + (f?.cats?.length || 0) + (f?.labels?.length || 0) + (f?.type && f.type !== 'all' ? 1 : 0) + (f?.natures?.length || 0)
  + (f?.transfers === 'without' ? 1 : 0) + (f?.status && f.status !== 'all' ? 1 : 0) + (f?.currencies?.length || 0);

/** Record passes the analytics filter: accounts, categories (group id or sub id), labels. */
export function matchFilter(r, f) {
  if (!f) return true;
  if (f.type && f.type !== 'all' && r.type !== f.type) return false;
  if (f.transfers === 'without' && r.type === 'transfer') return false;
  if (f.status === 'done' && r.status === 'planned') return false;
  if (f.status === 'planned' && r.status !== 'planned') return false;
  if (f.currencies?.length && !f.currencies.includes(accCurrency(r.accountId)) && !(r.toAccountId && f.currencies.includes(accCurrency(r.toAccountId)))) return false;
  if (f.natures?.length && !f.natures.includes(natureOfRecord(r))) return false;
  if (f.accounts?.length && !f.accounts.includes(r.accountId) && !f.accounts.includes(r.toAccountId)) return false;
  if (f.cats?.length) {
    if (!r.categoryId) return false;
    const grp = r.categoryId.split('.')[0];
    if (!f.cats.includes(r.categoryId) && !f.cats.includes(grp)) return false;
  }
  if (f.labels?.length && !(r.labels || []).some((l) => f.labels.includes(l))) return false;
  return true;
}

/** Copy of a record with `amount` in rubles; the original stays in `orig`. Analytics always work in rubles. */
export const inRub = (r, s = state) => {
  const cur = accCurrency(r.accountId, s);
  return cur === 'RUB' ? r : { ...r, amount: toRub(r.amount, cur, s), orig: { amount: r.amount, currency: cur } };
};

/** A surprise: the record is hidden from this person everywhere except account balances. */
export const hiddenFromMe = (r, s = state) => Boolean(r.secretFrom && r.secretFrom === s.settings.me);
export const otherPerson = (s = state) => PEOPLE.find((p) => p !== s.settings.me) || PEOPLE[1];

export const visibleRecords = (s = state, { ignoreFilter = false } = {}) => {
  let recs = live(s.ledger.records).filter((r) => !hiddenFromMe(r, s)).map((r) => inRub(r, s));
  if (s.settings.view !== 'all') recs = recs.filter((r) => r.owner === s.settings.view);
  if (!ignoreFilter && filterCount(s.settings.filter)) recs = recs.filter((r) => matchFilter(r, s.settings.filter));
  return recs;
};

/** Accounts shown for the current person view: own ones, plus shared when showing everyone. */
export const visibleAccounts = (s = state) => {
  const accs = live(s.ledger.accounts);
  const f = s.settings.filter || {};
  return accs.filter((a) => (s.settings.view === 'all' || a.owner === s.settings.view)
    && (!f.accounts?.length || f.accounts.includes(a.id))
    && (!f.currencies?.length || f.currencies.includes(a.currency || 'RUB')));
};

export const allLabels = (s = state) => [...new Set(live(s.ledger.records).flatMap((r) => r.labels || []))].sort();

/** Creates a record from a template right now. Returns the new record. */
export function addFromTemplate(t) {
  const { id, name, updatedAt, by, deleted, uses, ...fields } = t;
  // Templates are shared, so the record belongs to whoever tapped it.
  const accOwner = state.ledger.accounts.find((a) => a.id === fields.accountId)?.owner;
  const rec = upsert('records', { ...fields, owner: accOwner || state.settings.me || fields.owner, date: new Date().toISOString(), status: 'done', template: id });
  upsert('templates', { ...t, uses: (uses || 0) + 1 });
  return rec;
}

/** Signed effect of a record on one account. */
export function effectOn(r, accountId) {
  if (r.status === 'planned') return 0;
  if (r.type === 'expense') return r.accountId === accountId ? -r.amount : 0;
  if (r.type === 'income') return r.accountId === accountId ? r.amount : 0;
  if (r.type === 'transfer') {
    if (r.accountId === accountId) return -r.amount;
    if (r.toAccountId === accountId) return r.toAmount ?? r.amount;
  }
  return 0;
}

export function accountBalance(acc, records, until = null) {
  let b = Number(acc.initial) || 0;
  for (const r of records) {
    if (until && new Date(r.date) > until) continue;
    b += effectOn(r, acc.id);
  }
  return b;
}

/** Signed amount for totals: income +, expense -, transfers 0. */
export const signed = (r) => (r.type === 'income' ? r.amount : r.type === 'expense' ? -r.amount : 0);

/* ---------- demo ---------- */
export function loadDemo() {
  const days = (n, h = 12) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const start = { 'misha-cash': 8000, 'misha-psb': 60000, 'misha-sber': 30000, 'misha-tbank': 45000, 'misha-ozon': 20000,
    'arina-cash': 6000, 'arina-sber': 35000, 'arina-tbank': 20000, 'arina-ozon': 12000, 'pillow-rub': 150000, 'pillow-usd': 1200, 'pillow-eur': 800 };
  const acc = DEFAULT_ACCOUNTS.map((a) => ({ ...a, initial: start[a.id] || 0 }));
  const R = (n, type, amount, accountId, categoryId, owner, extra = {}) => ({
    id: uid(), type, amount, accountId, categoryId, owner, date: days(n, 9 + (n % 10)), status: 'done', ...extra,
  });
  const recs = [
    R(0, 'expense', 2999, 'misha-tbank', 'tech.3', 'Миша', { note: 'VPN на год' }),
    R(1, 'income', 9500, 'arina-sber', 'inc.6', 'Арина'),
    R(1, 'expense', 127.89, 'misha-sber', 'food.1', 'Миша'),
    R(2, 'expense', 1890, 'arina-tbank', 'food.2', 'Арина', { payee: 'Кофейня' }),
    R(3, 'expense', 14814, 'misha-ozon', 'shop.7', 'Миша', { payee: 'Озон' }),
    R(4, 'expense', 3450.5, 'arina-sber', 'food.1', 'Арина', { payee: 'Супермаркет' }),
    R(5, 'expense', 2500, 'misha-cash', 'car.1', 'Миша', { payee: 'АЗС' }),
    R(6, 'expense', 146, 'arina-ozon', 'life.7', 'Арина'),
    R(7, 'income', 47820, 'misha-psb', 'inc.1', 'Миша'),
    R(8, 'expense', 5600, 'arina-ozon', 'shop.0', 'Арина'),
    R(9, 'transfer', 20000, 'misha-psb', '', 'Миша', { toAccountId: 'pillow-rub', note: 'В подушку' }),
    R(10, 'expense', 12091, 'misha-tbank', 'tech.3', 'Миша'),
    R(11, 'transfer', 9000, 'misha-tbank', '', 'Миша', { toAccountId: 'pillow-usd', toAmount: 100, note: 'Купил доллары' }),
    R(12, 'expense', 4200, 'arina-sber', 'food.1', 'Арина'),
    R(14, 'expense', 3355, 'misha-cash', 'car.1', 'Миша'),
    R(18, 'income', 55000, 'arina-tbank', 'inc.1', 'Арина'),
    R(20, 'expense', 980, 'arina-cash', 'trans.2', 'Арина'),
    R(22, 'expense', 7290, 'misha-sber', 'life.10', 'Миша'),
    R(26, 'expense', 2100, 'misha-sber', 'food.2', 'Миша'),
    R(29, 'expense', 18500, 'arina-sber', 'home.1', 'Арина'),
    R(33, 'expense', 3000, 'misha-psb', 'fin.3', 'Миша'),
    R(40, 'income', 47820, 'misha-psb', 'inc.1', 'Миша'),
  ];
  const next = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); return d.toISOString(); };
  const sch = [
    { id: uid(), name: 'Комиссия ПСБ', type: 'expense', amount: 99, accountId: 'misha-psb', categoryId: 'fin.6', owner: 'Миша', date: next(2), repeat: 'monthly' },
    { id: uid(), name: 'Мобильная связь', type: 'expense', amount: 650, accountId: 'arina-tbank', categoryId: 'tech.1', owner: 'Арина', date: next(9), repeat: 'monthly' },
  ];
  const tpl = [
    { id: uid(), name: 'Кофе', type: 'expense', amount: 250, accountId: 'misha-tbank', categoryId: 'food.2', payee: 'Кофейня', labels: [], payment: 'Карта' },
    { id: uid(), name: 'Бензин', type: 'expense', amount: 2500, accountId: 'misha-sber', categoryId: 'car.1', payee: 'АЗС', labels: [], payment: 'Карта' },
    { id: uid(), name: 'Метро', type: 'expense', amount: 75, accountId: 'arina-tbank', categoryId: 'trans.1', labels: [], payment: 'Карта' },
  ];
  replaceLedger({ accounts: acc, records: recs, scheduled: sch, budgets: [], templates: tpl });
}

export function wipeLocal() {
  replaceLedger(emptyLedger());
}

/** After the PIN is entered on this phone: open my sealed secrets that are already here. */
export async function reopenSecrets() {
  const records = await openMine(state.ledger.records, state.settings.me);
  if (records !== state.ledger.records) { const ledger = { ...state.ledger, records }; persist(LEDGER_KEY, ledger); set({ ledger }); }
}
/** This person's PIN profile, if they have set one. */
export const profileOf = (person, s = state) => live(s.ledger.profiles || []).find((p) => p.id === person) || null;
