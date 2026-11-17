import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, RecordRow, Empty, Row, Sheet, Segmented, CatIcon, PERSON_COLOR } from './kit.jsx';
import { Bar } from './charts.jsx';
import { useStore, alive, upsert, remove, inRub, hiddenFromMe, PEOPLE } from '../data/store.js';
import { AccountOptions } from './Accounts.jsx';
import { category, group, EXPENSE_GROUPS } from '../data/categories.js';
import { rub, toLocalInput, addMonths, addDays } from '../data/format.js';
import { periodRange, inRange } from '../data/periods.js';
import { CategoryPicker } from './RecordForm.jsx';
import { payScheduled, duePayments, myScheduled } from './Payments.jsx';

export function Planning() {
  const nav = useNav();
  const s = useStore();
  const due = duePayments(s).length;
  const count = myScheduled(s).length;
  return (
    <Screen title="Планы">
      <div class="stack">
        <button class="tile" onClick={() => nav.push(Scheduled, {})}>
          <div class="tl"><div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>Запланированные платежи{due > 0 && <span class="badge-dot inline">{due}</span>}</div><div class="muted" style={{ fontSize: 'var(--fs-m)', marginTop: 4 }}>Ваши будущие платежи{count ? ` · ${count}` : ''}</div></div>
          <div class="app-ico" style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--warn)', display: 'grid', placeItems: 'center', fontSize: 30 }} aria-hidden="true">⏰</div>
        </button>
        <button class="tile" onClick={() => nav.push(Budgets, {})}>
          <div class="tl"><div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>Бюджеты</div><div class="muted" style={{ fontSize: 'var(--fs-m)', marginTop: 4 }}>Лимиты на месяц по категориям</div></div>
          <div class="app-ico" style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: 30 }} aria-hidden="true">💰</div>
        </button>
      </div>
    </Screen>
  );
}

/* ---------- scheduled payments ---------- */
const REPEAT = [['none', 'Один раз'], ['weekly', 'Каждую неделю'], ['monthly', 'Каждый месяц'], ['yearly', 'Каждый год']];
export const nextDate = (iso, repeat) => {
  const d = new Date(iso);
  if (repeat === 'weekly') return addDays(d, 7).toISOString();
  if (repeat === 'monthly') return addMonths(d, 1).toISOString();
  if (repeat === 'yearly') return addMonths(d, 12).toISOString();
  return null;
};

export { Scheduled } from './Payments.jsx';

export function ScheduledForm({ item, onClose }) {
  const s = useStore();
  const accounts = alive(s.ledger.accounts);
  const [f, setF] = useState(item ? { ...item, amountText: String(item.amount) } : {
    name: '', type: 'expense', amountText: '', accountId: accounts[0]?.id, categoryId: '', owner: s.settings.me,
    date: addDays(new Date(), 1).toISOString(), repeat: 'monthly',
  });
  const [pick, setPick] = useState(false);
  const upd = (p) => setF((x) => ({ ...x, ...p }));
  const amount = Number(String(f.amountText).replace(',', '.')) || 0;
  const valid = amount > 0 && f.categoryId && f.accountId;
  const toItem = () => { const { amountText, occ, ...rest } = f; return { ...rest, amount, name: f.name.trim() || category(f.categoryId).name }; };
  const save = () => { if (!valid) return; upsert('scheduled', toItem()); onClose(); };
  const payNow = () => { if (!valid) return; payScheduled(toItem()); onClose(); };
  if (pick) return <CategoryPicker type={f.type} onPick={(id) => { upd({ categoryId: id }); setPick(false); }} onClose={() => setPick(false)} />;
  return (
    <Sheet title={item ? 'Платёж' : 'Новый платёж'} onClose={onClose} right={<button class="link strong" onClick={save} disabled={!valid}>Готово</button>}
      footer={item && <div style={{ display: 'grid', gap: 8 }}><button class="btn green" onClick={payNow}>Оплачено — записать</button><button class="btn danger" onClick={() => { remove('scheduled', item.id); onClose(); }}>Удалить</button></div>}>
      <div style={{ padding: '0 var(--s4) var(--s3)' }}><Segmented light options={[['expense', 'Расход'], ['income', 'Доход']]} value={f.type} onChange={(type) => upd({ type, categoryId: '' })} /></div>
      <div class="list">
        <label class="row"><span class="rl">Название</span><input value={f.name} placeholder="Например, Комиссия банка" onInput={(e) => upd({ name: e.currentTarget.value })} /></label>
        <label class="row"><span class="rl">Сумма, ₽</span><input inputMode="decimal" value={f.amountText} placeholder="0" onInput={(e) => upd({ amountText: e.currentTarget.value })} /></label>
        <Row label="Категория" value={f.categoryId ? category(f.categoryId).name : 'Обязательно'} valueClass={f.categoryId ? '' : 'req'} onClick={() => setPick(true)} />
        <label class="row"><span class="rl">Счёт</span><select value={f.accountId} onChange={(e) => upd({ accountId: e.currentTarget.value })}><AccountOptions accounts={accounts} me={s.settings.me} /></select></label>
        <label class="row"><span class="rl">Ближайшая дата</span><input type="datetime-local" value={toLocalInput(f.date)} onInput={(e) => e.currentTarget.value && upd({ date: new Date(e.currentTarget.value).toISOString() })} /></label>
        <label class="row"><span class="rl">Повтор</span><select value={f.repeat} onChange={(e) => upd({ repeat: e.currentTarget.value })}>{REPEAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <div class="row"><span class="rl">Чей</span><div class="who">{PEOPLE.map((p) => <button key={p} class={f.owner === p ? 'on' : ''} onClick={() => upd({ owner: p })}><span style={{ color: PERSON_COLOR[p] }}>●</span> {p}</button>)}</div></div>
      </div>
    </Sheet>
  );
}

/* ---------- budgets ---------- */
export function budgetSpent(b, recs) {
  const range = periodRange({ kind: 'cal', unit: 'month', offset: 0 });
  return recs.filter((r) => r.type === 'expense' && inRange(r, range) && (b.groupId === 'all' || category(r.categoryId).group === b.groupId) && (!b.owner || b.owner === r.owner))
    .reduce((a, r) => a + r.amount, 0);
}

export function Budgets() {
  const s = useStore();
  const nav = useNav();
  const [edit, setEdit] = useState(undefined);
  const list = alive(s.ledger.budgets);
  const recs = alive(s.ledger.records).filter((r) => !hiddenFromMe(r, s)).map((r) => inRub(r, s));
  return (
    <Screen pushed title="Бюджеты" back="Планы" onBack={nav.pop} right={<button class="link" onClick={() => setEdit(null)}>Добавить</button>}>
      {list.length === 0 && <Empty icon="💰" text="Активных бюджетов нет"><button class="link strong" onClick={() => setEdit(null)}>Создать бюджет</button></Empty>}
      <div class="stack">
        {list.map((b) => {
          const spent = budgetSpent(b, recs);
          const left = b.amount - spent;
          return (
            <button key={b.id} class="card" style={{ textAlign: 'left', width: '100%' }} onClick={() => setEdit(b)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {b.groupId !== 'all' ? <CatIcon catId={`${b.groupId}.0`} size={36} /> : <span class="cat-ico" style={{ background: 'var(--accent)', width: 36, height: 36, fontSize: 16 }}>Σ</span>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--fs-l)' }}>{b.name}</div>
                  <div class="muted">{b.owner || 'Общий'} · на месяц</div>
                </div>
              </div>
              <div class="progress" style={{ marginTop: 14 }}><div style={{ width: `${Math.min(100, (spent / b.amount) * 100)}%`, background: left < 0 ? 'var(--neg)' : group(b.groupId)?.color || 'var(--accent)' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }} class="num">
                <span class="muted">Потрачено {rub(spent)}</span>
                <span style={{ color: left < 0 ? 'var(--neg-text)' : 'var(--text)' }}>{left < 0 ? `Перерасход ${rub(-left)}` : `Осталось ${rub(left)}`}</span>
              </div>
            </button>
          );
        })}
      </div>
      {edit !== undefined && <BudgetForm item={edit} onClose={() => setEdit(undefined)} />}
    </Screen>
  );
}

function BudgetForm({ item, onClose }) {
  const [f, setF] = useState(item ? { ...item, amountText: String(item.amount) } : { name: '', groupId: 'food', owner: '', amountText: '' });
  const upd = (p) => setF((x) => ({ ...x, ...p }));
  const amount = Number(String(f.amountText).replace(',', '.')) || 0;
  const save = () => {
    if (!amount) return;
    const { amountText, ...rest } = f;
    upsert('budgets', { ...rest, amount, name: f.name.trim() || (f.groupId === 'all' ? 'Все расходы' : group(f.groupId).name) });
    onClose();
  };
  return (
    <Sheet short title={item ? 'Бюджет' : 'Новый бюджет'} onClose={onClose} right={<button class="link strong" onClick={save} disabled={!amount}>Готово</button>}
      footer={item && <button class="btn danger" onClick={() => { remove('budgets', item.id); onClose(); }}>Удалить бюджет</button>}>
      <div class="list">
        <label class="row"><span class="rl">Название</span><input value={f.name} placeholder="Необязательно" onInput={(e) => upd({ name: e.currentTarget.value })} /></label>
        <label class="row"><span class="rl">Категория</span>
          <select value={f.groupId} onChange={(e) => upd({ groupId: e.currentTarget.value })}>
            <option value="all">Все расходы</option>
            {EXPENSE_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label class="row"><span class="rl">Лимит в месяц, ₽</span><input inputMode="decimal" value={f.amountText} placeholder="0" onInput={(e) => upd({ amountText: e.currentTarget.value })} /></label>
        <label class="row"><span class="rl">Чей</span>
          <select value={f.owner} onChange={(e) => upd({ owner: e.currentTarget.value })}>
            <option value="">Общий</option>{PEOPLE.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
      </div>
    </Sheet>
  );
}

export { Bar };
