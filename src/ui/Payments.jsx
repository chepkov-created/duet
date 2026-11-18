// Scheduled payments like the original: list with tabs, a payment card with history,
// "Отметить как оплачено" / "Пропустить", notifications (bell) and the forecast.
import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, Empty, Segmented, CatIcon, Sheet } from './kit.jsx';
import { AmountInput } from './RecordForm.jsx';
import { Calendar } from './DatePick.jsx';
import { DayBars, dayBuckets, Carousel } from './viz.jsx';
import { useStore, alive, upsert, remove, getState, updateSettings, accountBalance, inRub } from '../data/store.js';
import { category } from '../data/categories.js';
import { rub, addMonths, dayStart, dayLabel, plural } from '../data/format.js';
import { usePeriod, PeriodDock } from './Period.jsx';
import { budgetSpent, Budgets, ScheduledForm } from './Planning.jsx';
import { nextDate, repeatText } from '../data/repeat.js';
export { repeatText };
import { accLabel } from './Accounts.jsx';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const fullDate = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`; };
export const daysUntil = (iso) => Math.round((dayStart(iso) - dayStart(new Date())) / 864e5);
const dueText = (n) => (n < 0 ? `Просрочено на ${-n} ${plural(-n, 'день', 'дня', 'дней')}` : n === 0 ? 'Сегодня' : n === 1 ? 'Завтра' : `Через ${n} ${plural(n, 'день', 'дня', 'дней')}`);

/** Scheduled payments the current person sees. */
export const myScheduled = (s = getState()) => alive(s.ledger.scheduled).filter((x) => s.settings.view === 'all' || !x.owner || x.owner === s.settings.view || x.owner === s.settings.me);
/** Payments due today, tomorrow or overdue: the badge on «Планы» and the bell. */
export const duePayments = (s = getState()) => myScheduled(s).filter((x) => daysUntil(x.date) <= 1).sort((a, b) => new Date(a.date) - new Date(b.date));

const dkey = (iso) => String(iso).slice(0, 10);
/** Amount of one occurrence: changed with «Редактировать» on that date, else the usual one. */
export const amountFor = (x, occ = x.date) => (x.amounts || {})[dkey(occ)] ?? x.amount;
/** Next `count` unpaid dates of a payment (dates already paid or skipped ahead are left out). */
export function upcomingDates(x, count = 2) {
  const done = new Set((x.done || []).map(dkey));
  const out = [];
  for (let d = x.date, i = 0; d && out.length < count && i < 60; i++, d = nextDate(d, x.repeat, x)) if (!done.has(dkey(d))) out.push(d);
  return out;
}

/** Pay one occurrence (the nearest by default): a real record linked to the payment. */
export function payScheduled(x, amount = amountFor(x), date = new Date().toISOString(), occ = x.date) {
  upsert('records', {
    // fixed id per occurrence: if both phones confirm the same payment, it is still one record
    id: `sch-${x.id}-${dkey(occ)}`,
    type: x.type, amount, accountId: x.accountId, categoryId: x.categoryId, owner: x.owner || getState().settings.me,
    date, note: x.note ? `${x.name} · ${x.note}` : x.name, payee: x.payee || '', labels: x.labels || [], status: 'done', payment: x.payment || 'Карта', scheduledId: x.id, dueDate: occ,
  });
  if (dkey(occ) === dkey(x.date)) advance(x); else upsert('scheduled', { ...x, done: [...(x.done || []), occ] });
}
/** Payments with «Автоматически»: on the due day the record is created by itself (on the owner's phone). */
export function autoPayDue(s = getState()) {
  let n = 0;
  for (const x0 of alive(s.ledger.scheduled)) {
    if (x0.confirm !== 'auto' || (x0.owner && x0.owner !== s.settings.me)) continue;
    let x = x0;
    for (let i = 0; i < 24 && x && daysUntil(x.date) <= 0; i++) {
      payScheduled(x, amountFor(x), x.date);
      n++;
      const nd = nextDate(x.date, x.repeat, x);
      x = nd ? { ...x, date: nd } : null;
    }
  }
  return n;
}
export function skipScheduled(x, occ = x.date) {
  const y = { ...x, skipped: [...(x.skipped || []), occ] };
  if (dkey(occ) === dkey(x.date)) advance(y); else upsert('scheduled', { ...y, done: [...(x.done || []), occ] });
}
/** Move to the next date that wasn't already paid ahead; a one-off payment ends. */
function advance(x) {
  const done = new Set((x.done || []).map(dkey));
  let nd = nextDate(x.date, x.repeat, x);
  for (let i = 0; nd && done.has(dkey(nd)) && i < 60; i++) nd = nextDate(nd, x.repeat, x);
  if (!nd) return remove('scheduled', x.id);
  const amounts = Object.fromEntries(Object.entries(x.amounts || {}).filter(([k]) => k >= dkey(nd)));
  upsert('scheduled', { ...x, date: nd, done: (x.done || []).filter((d) => dkey(d) > dkey(nd)), amounts });
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
        <span class={`num ${x.type === 'income' ? 'pos-text' : ''}`} style={{ fontSize: 'var(--fs-l)' }}>{rub(x.type === 'income' ? amountFor(x) : -amountFor(x))}</span>
        <span class={n <= 1 ? 'due-soon' : 'muted'} style={{ fontSize: 'var(--fs-s)' }}>{dueText(n)}</span>
      </span>
    </button>
  );
}

/* ---------- card ---------- */
const statusText = (n) => (n < 0 ? `Просрочено на ${-n} ${plural(-n, 'день', 'дня', 'дней')}` : n === 0 ? 'Срок сегодня' : n === 1 ? 'Срок завтра' : `Срок через ${n} ${plural(n, 'день', 'дня', 'дней')}`);
const Clock = ({ color }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: 'none' }}>
    <circle cx="10" cy="10" r="10" fill={color} /><path d="M10 4.5V10h4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" />
  </svg>
);
const Tick = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: 'none' }}>
    <circle cx="10" cy="10" r="10" fill="var(--text-2)" /><path d="M5.5 10.2l3 3 6-6.4" stroke="var(--bg)" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export function PaymentDetail({ id }) {
  const s = useStore();
  const nav = useNav();
  const [edit, setEdit] = useState(false);
  const [occEdit, setOccEdit] = useState(null);
  const [page, setPage] = useState(0);
  const x = alive(s.ledger.scheduled).find((y) => y.id === id);
  if (!x) return <Screen pushed title="Платёж" back="Назад" onBack={nav.pop}><Empty icon="✓" text="Платёж завершён или удалён" /></Screen>;
  const upcoming = upcomingDates(x, 2);
  const paid = alive(s.ledger.records).filter((r) => r.scheduledId === id).map((r) => ({ kind: 'paid', date: r.dueDate || r.date, at: r.date, amount: r.amount }));
  const skipped = (x.skipped || []).map((d) => ({ kind: 'skip', date: d }));
  const history = [...paid, ...skipped].sort((a, b) => new Date(b.date) - new Date(a.date));
  const acc = s.ledger.accounts.find((a) => a.id === x.accountId);
  const sign = (v) => rub(x.type === 'income' ? v : -v);
  const pay = (occ) => { const v = amountFor(x, occ); payScheduled(x, v, new Date().toISOString(), occ); nav.toast(`Оплачено: ${x.name} · ${sign(v)}`); };
  const info = [
    ['Счёт', acc ? accLabel(acc) : '—'], ['Повтор', repeatText(x)], ['Подтверждение', x.confirm === 'auto' ? 'Автоматически' : 'Вручную'],
    ['Тип платежа', x.payment || 'Карта'], x.payee && ['Получатель', x.payee], x.note && ['Заметка', x.note], x.labels?.length && ['Метки', x.labels.join(', ')],
  ].filter(Boolean);
  return (
    <Screen pushed title={x.name} back="Назад" onBack={nav.pop} right={<button class="link" onClick={() => setEdit(true)}>Редактировать</button>}>
      <div class="pay-hero-wrap">
        <Carousel page={page} onChange={setPage} dotLabel="Карточка" pages={[
          <div key="a" class="pay-hero">
            <CatIcon catId={x.categoryId} size={96} />
            <div class="pay-name">{x.name}</div>
            <div class="muted" style={{ fontSize: 'var(--fs-l)' }}>{category(x.categoryId).name}</div>
            <div class={`pay-amount num ${x.type === 'income' ? 'pos-text' : ''}`}>{sign(x.amount)}</div>
          </div>,
          <div key="b" class="pay-info">
            {info.map(([k, v]) => <div key={k} class="pay-info-row"><span class="muted">{k}</span><span>{v}</span></div>)}
          </div>,
        ]} />
      </div>
      <div class="group-label">Обзор платежа</div>
      <div class="list">
        {upcoming.map((d) => {
          const n = daysUntil(d);
          const color = n < 0 ? 'var(--neg)' : n <= 1 ? 'var(--warn)' : 'var(--accent)';
          const custom = amountFor(x, d) !== x.amount;
          return (
            <div key={d} class="pay-occ">
              <div class="pay-occ-date">{fullDate(d)}</div>
              <div class="pay-occ-status" style={{ color }}><Clock color={color} />{statusText(n)}{custom && <span class="muted" style={{ marginLeft: 'auto' }}>{sign(amountFor(x, d))}</span>}</div>
              <div class="pay-occ-btns">
                <button class="btn primary sm" onClick={() => pay(d)}>Отметить как оплачено</button>
                <button class="btn outline sm" onClick={() => setOccEdit(d)}>Редактировать</button>
              </div>
            </div>
          );
        })}
        {history.map((h, i) => (
          <div key={i} class="pay-occ done">
            <div class="pay-occ-date">{fullDate(h.date)}</div>
            <div class="pay-occ-status">
              {h.kind === 'paid' ? <Tick /> : <span aria-hidden="true">⏭</span>}
              <span>{h.kind === 'paid' ? `Оплачено ${fullDate(h.at)}` : 'Пропущено'}</span>
              {h.kind === 'paid' && <span class="num" style={{ marginLeft: 'auto' }}>{sign(h.amount)}</span>}
            </div>
          </div>
        ))}
      </div>
      {history.length === 0 && <div class="note-box">Оплат пока не было. «Отметить как оплачено» создаёт запись и переносит платёж на следующий срок.</div>}
      <div style={{ height: 'var(--s6)' }} />
      {edit && <ScheduledForm item={x} onClose={() => setEdit(false)} />}
      {occEdit && <OccurrenceSheet x={x} occ={occEdit} onClose={() => setOccEdit(null)} onPaid={(v) => nav.toast(`Оплачено: ${x.name} · ${sign(v)}`)} />}
    </Screen>
  );
}

/** «Редактировать» one date of a payment: its own amount, the payment date, pay or skip just this one. */
function OccurrenceSheet({ x, occ, onClose, onPaid }) {
  const [text, setText] = useState(String(amountFor(x, occ)).replace('.', ','));
  const [when, setWhen] = useState(() => (new Date(occ) > new Date() ? new Date() : new Date(occ)));
  const amount = Number(String(text).replace(/\s/g, '').replace(',', '.')) || 0;
  const keep = () => { upsert('scheduled', { ...x, amounts: { ...(x.amounts || {}), [dkey(occ)]: amount } }); onClose(); };
  const pay = () => { if (!amount) return; payScheduled(x, amount, when.toISOString(), occ); onPaid(amount); onClose(); };
  const skip = () => { skipScheduled(x, occ); onClose(); };
  return (
    <Sheet title={`Платёж ${fullDate(occ).replace(' г.', '')}`} onClose={onClose} right={<button class="link strong" onClick={keep} disabled={!amount}>Сохранить</button>}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          <button class="btn primary" onClick={pay} disabled={!amount}>Отметить как оплачено</button>
          <button class="btn danger" onClick={skip}>Пропустить этот платёж</button>
        </div>
      }>
      <label class="amount-box">
        <span class="cur">RUB</span><span class="sr-only">Сумма</span>
        <AmountInput cls={x.type} big value={text} onChange={setText} />
      </label>
      <div class="note-box">Сумма меняется только для этой даты. «Сохранить» — запомнить её, «Отметить как оплачено» — сразу записать.</div>
      <div class="group-label">Дата оплаты</div>
      <div class="list" style={{ padding: 'var(--s2) var(--s3)' }}>
        <Calendar value={when} max={new Date()} onChange={(d) => { const t = new Date(d); const n = new Date(); t.setHours(n.getHours(), n.getMinutes(), 0, 0); setWhen(t); }} />
      </div>
    </Sheet>
  );
}

/* ---------- notifications ---------- */
export function notifications(s = getState()) {
  const out = [];
  const dismissed = s.settings.dismissed || {};
  for (const x of duePayments(s)) {
    const n = daysUntil(x.date);
    if (x.confirm === 'auto' || (n <= 0 && x.notifyDay === false)) continue;
    const key = `pay:${x.id}:${x.date.slice(0, 10)}`;
    if (dismissed[key]) continue;
    out.push({ key, icon: '⏰', title: n < 0 ? 'Платёж просрочен' : n === 0 ? 'Платёж подлежит оплате сегодня' : 'Платёж подлежит оплате завтра', text: `Не забудьте оплатить: ${x.name} · ${rub(amountFor(x))}`, date: x.date, pay: x.id });
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
      if (new Date(d) >= from && !(x.done || []).some((y) => dkey(y) === dkey(d))) out.push({ ...x, date: d, amount: amountFor(x, d) });
      d = nextDate(d, x.repeat, x);
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
