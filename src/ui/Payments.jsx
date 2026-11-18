// Scheduled payments like the original: list with tabs, a payment card with history,
// "Отметить как оплачено" / "Пропустить", notifications (bell) and the forecast.
import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, Empty, Segmented, CatIcon } from './kit.jsx';
import { DayBars, dayBuckets } from './viz.jsx';
import { useStore, alive, upsert, remove, getState, updateSettings, accountBalance, inRub } from '../data/store.js';
import { category } from '../data/categories.js';
import { rub, addMonths, dayStart, dayLabel, plural } from '../data/format.js';
import { usePeriod, PeriodDock } from './Period.jsx';
import { budgetSpent, Budgets, ScheduledForm, nextDate } from './Planning.jsx';
import { accLabel } from './Accounts.jsx';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const fullDate = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`; };
export const daysUntil = (iso) => Math.round((dayStart(iso) - dayStart(new Date())) / 864e5);
const dueText = (n) => (n < 0 ? `Просрочено на ${-n} ${plural(-n, 'день', 'дня', 'дней')}` : n === 0 ? 'Сегодня' : n === 1 ? 'Завтра' : `Через ${n} ${plural(n, 'день', 'дня', 'дней')}`);

/** Scheduled payments the current person sees. */
export const myScheduled = (s = getState()) => alive(s.ledger.scheduled).filter((x) => s.settings.view === 'all' || !x.owner || x.owner === s.settings.view || x.owner === s.settings.me);
/** Payments due today, tomorrow or overdue: the badge on «Планы» and the bell. */
export const duePayments = (s = getState()) => myScheduled(s).filter((x) => daysUntil(x.date) <= 1).sort((a, b) => new Date(a.date) - new Date(b.date));

/** Pay the nearest occurrence: a real record linked to the payment, then move to the next date. */
export function payScheduled(x, amount = x.amount) {
  upsert('records', {
    type: x.type, amount, accountId: x.accountId, categoryId: x.categoryId, owner: x.owner || getState().settings.me,
    date: new Date().toISOString(), note: x.name, payee: '', labels: [], status: 'done', payment: 'Карта', scheduledId: x.id, dueDate: x.date,
  });
  advance(x);
}
export function skipScheduled(x) { advance({ ...x, skipped: [...(x.skipped || []), x.date] }); }
function advance(x) {
  const nd = nextDate(x.date, x.repeat);
  if (nd) upsert('scheduled', { ...x, date: nd }); else remove('scheduled', x.id);
}

/* ---------- list ---------- */
export function Scheduled() {
  const s = useStore();
  const nav = useNav();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(undefined);
  const needle = q.trim().toLowerCase();
  const list = myScheduled(s)
    .filter((x) => tab === 'all' || x.type === tab)
    .filter((x) => !needle || [x.name, category(x.categoryId).name].some((t) => (t || '').toLowerCase().includes(needle)))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return (
    <Screen pushed title="Запланированные платежи" back="Назад" onBack={nav.pop}
      right={<button class="round-add" aria-label="Добавить платёж" onClick={() => setEdit(null)}>+</button>}>
      <label class="search"><span aria-hidden="true">🔍</span><span class="sr-only">Поиск</span><input type="search" placeholder="Поиск" value={q} onInput={(e) => setQ(e.currentTarget.value)} /></label>
      <div class="period-dock" style={{ bottom: 0 }}>
        <Segmented options={[['all', 'Все'], ['income', 'Доход'], ['expense', 'Расход']]} value={tab} onChange={setTab} />
      </div>
      {list.length === 0 && <Empty icon="⏰" text="Нет запланированных платежей"><button class="link strong" onClick={() => setEdit(null)}>Добавить платёж</button></Empty>}
      {list.length > 0 && (
        <div class="list">
          {list.map((x) => <PayRow key={x.id} x={x} onClick={() => nav.push(PaymentDetail, { id: x.id })} />)}
        </div>
      )}
      <div style={{ height: 90 }} aria-hidden="true" />
      {edit !== undefined && <ScheduledForm item={edit} onClose={() => setEdit(undefined)} />}
    </Screen>
  );
}

const WEEKDAYS = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'];
/** "Каждый месяц, 19-го" / "Каждую неделю по средам" / "Каждый год, 19 ноября" / "Один раз" */
export function repeatText(x) {
  const d = new Date(x.date);
  if (x.repeat === 'monthly') return `Каждый месяц, ${d.getDate()}-го`;
  if (x.repeat === 'weekly') return `Каждую неделю по ${WEEKDAYS[d.getDay()]}`;
  if (x.repeat === 'yearly') return `Каждый год, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return 'Один раз';
}

export function PayRow({ x, onClick }) {
  const s = useStore();
  const n = daysUntil(x.date);
  const c = category(x.categoryId);
  const acc = s.ledger.accounts.find((a) => a.id === x.accountId);
  return (
    <button class="row pay-row" onClick={onClick}>
      <CatIcon catId={x.categoryId} size={44} />
      <span class="rl">
        <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--fs-l)' }}>{x.name}</span>
        <span style={{ display: 'block' }}>{c.name}</span>
        <span class="muted" style={{ display: 'block', fontSize: 'var(--fs-s)' }}>{repeatText(x)}</span>
        {acc && <span class="muted" style={{ display: 'block', fontSize: 'var(--fs-s)' }}>{accLabel(acc)}</span>}
      </span>
      <span class="pay-side">
        {n <= 1 && <span class="badge-dot inline" style={{ margin: 0 }}>1</span>}
        <span class={`num ${x.type === 'income' ? 'pos-text' : ''}`} style={{ fontSize: 'var(--fs-l)' }}>{rub(x.type === 'income' ? x.amount : -x.amount)}</span>
        <span class={n <= 1 ? 'due-soon' : 'muted'} style={{ fontSize: 'var(--fs-s)' }}>{dueText(n)}</span>
      </span>
    </button>
  );
}

/* ---------- card ---------- */
export function PaymentDetail({ id }) {
  const s = useStore();
  const nav = useNav();
  const [edit, setEdit] = useState(false);
  const x = alive(s.ledger.scheduled).find((y) => y.id === id);
  if (!x) return <Screen pushed title="Платёж" back="Назад" onBack={nav.pop}><Empty icon="✓" text="Платёж завершён или удалён" /></Screen>;
  const upcoming = [x.date];
  const nd = nextDate(x.date, x.repeat);
  if (nd) upcoming.push(nd);
  const paid = alive(s.ledger.records).filter((r) => r.scheduledId === id).map((r) => ({ kind: 'paid', date: r.dueDate || r.date, at: r.date, amount: r.amount, rid: r.id }));
  const skipped = (x.skipped || []).map((d) => ({ kind: 'skip', date: d }));
  const history = [...paid, ...skipped].sort((a, b) => new Date(b.date) - new Date(a.date));
  const acc = s.ledger.accounts.find((a) => a.id === x.accountId);
  const pay = () => {
    const v = prompt('Сумма оплаты', String(x.amount).replace('.', ','));
    if (v === null) return;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    if (n > 0) { payScheduled(x, n); nav.toast(`Оплачено: ${x.name} · ${rub(-n)}`); }
  };
  return (
    <Screen pushed title={x.name} back="Назад" onBack={nav.pop} right={<button class="link" onClick={() => setEdit(true)}>Изменить</button>}>
      <div class="pay-hero">
        <CatIcon catId={x.categoryId} size={72} />
        <div class="pay-name">{x.name}</div>
        <div class="muted">{category(x.categoryId).name} · {accLabel(acc)}</div>
        <div class={`pay-amount num ${x.type === 'income' ? 'pos-text' : ''}`}>{rub(x.type === 'income' ? x.amount : -x.amount)}</div>
      </div>
      <div class="group-label">Обзор платежа</div>
      <div class="list inset">
        {upcoming.map((d, i) => {
          const n = daysUntil(d);
          return (
            <div key={d} class="pay-occ">
              <div style={{ fontWeight: 600, fontSize: 'var(--fs-l)' }}>{fullDate(d)}</div>
              <div class={n <= 1 ? 'due-soon' : 'muted'}>{n <= 1 ? '⚠️ ' : '🕑 '}Срок: {dueText(n).toLowerCase()}</div>
              {i === 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button class="btn primary" style={{ padding: 10, fontSize: 'var(--fs-s)' }} onClick={pay}>Отметить как оплачено</button>
                  <button class="btn" style={{ padding: 10, fontSize: 'var(--fs-s)' }} onClick={() => { skipScheduled(x); nav.toast('Платёж пропущен'); }}>Пропустить</button>
                </div>
              )}
            </div>
          );
        })}
        {history.map((h, i) => (
          <div key={i} class="pay-occ done">
            <div style={{ fontWeight: 600 }}>{fullDate(h.date)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span class="muted">{h.kind === 'paid' ? `✅ Оплачено ${dayLabel(h.at).toLowerCase()}` : '⏭ Пропущено'}</span>
              {h.kind === 'paid' && <span class="num">{rub(-h.amount)}</span>}
            </div>
          </div>
        ))}
        {history.length === 0 && <div class="note-box">Оплат пока не было. «Отметить как оплачено» создаёт запись расхода и переносит платёж на следующий срок.</div>}
      </div>
      {edit && <ScheduledForm item={x} onClose={() => setEdit(false)} />}
    </Screen>
  );
}

/* ---------- notifications ---------- */
export function notifications(s = getState()) {
  const out = [];
  const dismissed = s.settings.dismissed || {};
  for (const x of duePayments(s)) {
    const n = daysUntil(x.date);
    const key = `pay:${x.id}:${x.date.slice(0, 10)}`;
    if (dismissed[key]) continue;
    out.push({ key, icon: '⏰', title: n < 0 ? 'Платёж просрочен' : n === 0 ? 'Платёж подлежит оплате сегодня' : 'Платёж подлежит оплате завтра', text: `Не забудьте оплатить: ${x.name} · ${rub(x.amount)}`, date: x.date, pay: x.id });
  }
  const recs = alive(s.ledger.records).map((r) => inRub(r, s));
  for (const b of alive(s.ledger.budgets)) {
    const spent = budgetSpent(b, recs);
    const month = new Date().toISOString().slice(0, 7);
    if (spent >= b.amount * 0.9) {
      const over = spent > b.amount;
      const key = `budget:${b.id}:${month}:${over ? 'over' : 'near'}`;
      if (dismissed[key]) continue;
      out.push({ key, icon: '💰', title: over ? 'Бюджет превышен' : 'Бюджет почти исчерпан', text: `${b.name}: потрачено ${rub(spent)} из ${rub(b.amount)}`, budget: true });
    }
  }
  return out;
}

export function Notifications() {
  const s = useStore();
  const nav = useNav();
  const list = notifications(s);
  const dismiss = (key) => updateSettings({ dismissed: { ...(s.settings.dismissed || {}), [key]: true } });
  return (
    <Screen pushed title="Уведомления" back="Обзор" onBack={nav.pop}>
      {list.length === 0 && <Empty icon="🔔" text="Новых уведомлений нет" />}
      <div class="stack">
        {list.map((n) => (
          <div key={n.key} class="notif">
            <span class="notif-ico" aria-hidden="true">{n.icon}</span>
            <button class="rl" style={{ textAlign: 'left' }} onClick={() => (n.pay ? nav.push(PaymentDetail, { id: n.pay }) : n.budget ? nav.push(Budgets, {}) : null)}>
              <b>{n.title}</b>
              <span style={{ display: 'block', color: 'var(--text-2)', fontSize: 'var(--fs-s)', marginTop: 2 }}>{n.text}</span>
              {n.date && <span class="muted" style={{ fontSize: 'var(--fs-xs)' }}>{fullDate(n.date)}</span>}
            </button>
            <button class="link" aria-label="Скрыть уведомление" style={{ color: 'var(--text-3)' }} onClick={() => dismiss(n.key)}>✕</button>
          </div>
        ))}
      </div>
    </Screen>
  );
}

export function BellButton() {
  const s = useStore();
  const nav = useNav();
  const n = notifications(s).length;
  return (
    <button class="icon-btn" aria-label={`Уведомления${n ? `: ${n}` : ''}`} style={{ position: 'relative', fontSize: 20 }} onClick={() => nav.push(Notifications, {})}>
      🔔{n > 0 && <span class="badge-dot">{n}</span>}
    </button>
  );
}

/* ---------- forecast ---------- */
/** occurrences of scheduled payments between from and to */
export function occurrences(list, from, to) {
  const out = [];
  for (const x of list) {
    let d = x.date;
    for (let i = 0; d && new Date(d) <= to && i < 400; i++) {
      if (new Date(d) >= from) out.push({ ...x, date: d });
      d = nextDate(d, x.repeat);
    }
  }
  return out;
}

export function Forecast() {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const [edit, setEdit] = useState(undefined);
  const from = new Date(Math.max(dayStart(new Date()), range.from));
  const to = range.to < from ? addMonths(from, 1) : range.to;
  const occ = occurrences(myScheduled(s).filter((x) => x.type === 'expense'), from, to);
  const total = occ.reduce((a, x) => a + x.amount, 0);
  const byCat = {};
  for (const x of occ) byCat[x.categoryId] = (byCat[x.categoryId] || 0) + x.amount;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  const days = dayBuckets(range.from, to).map((b) => ({ date: b.start, values: [{ v: occ.filter((x) => new Date(x.date) >= b.start && new Date(x.date) <= b.end).reduce((a, x) => a + x.amount, 0), color: 'var(--cat-teal)' }] }));
  return (
    <Screen pushed title="Прогноз" back="Статистика" onBack={nav.pop}>
      <section class="an-sec">
        <div class="an-head"><div><h2>Запланированные платежи по категориям</h2><p>Какие платежи будут у меня самыми крупными?</p></div></div>
        <div class="caption">{range.label}</div>
        <div class="big-amount num">{rub(total)}</div>
        {cats.map(([cid, v]) => (
          <div class="bar-row" key={cid}>
            <div class="bar-label"><span>{category(cid).name}</span><span class="num">{rub(v)}</span></div>
            <div class="bar"><div style={{ width: `${(v / max) * 100}%`, background: 'var(--cat-teal)' }} /></div>
          </div>
        ))}
        <button class="ghost-btn" style={{ marginTop: 'var(--s3)' }} onClick={() => setEdit(null)}>Добавить запланированный платёж</button>
      </section>
      <section class="an-sec">
        <div class="an-head"><div><h2>График платежей</h2><p>Когда и сколько нужно будет заплатить?</p></div></div>
        <DayBars days={days} legend={[['var(--cat-teal)', 'Платежи']]} />
      </section>
      <div style={{ height: 130 }} />
      <PeriodDock bottom="0px" />
      {edit !== undefined && <ScheduledForm item={edit} onClose={() => setEdit(undefined)} />}
    </Screen>
  );
}

export { accountBalance };
