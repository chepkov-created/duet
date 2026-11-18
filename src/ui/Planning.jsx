import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, RecordRow, Empty, Row, Sheet, Segmented, CatIcon, PERSON_COLOR } from './kit.jsx';
import { Bar } from './charts.jsx';
import { useStore, alive, upsert, remove, inRub, hiddenFromMe, PEOPLE } from '../data/store.js';
import { AccountOptions } from './Accounts.jsx';
import { category, group, EXPENSE_GROUPS } from '../data/categories.js';
import { rub, toLocalInput, addMonths, addDays } from '../data/format.js';
import { periodRange, inRange } from '../data/periods.js';
import { CategoryPicker, AmountInput, LabelsRow, PAY } from './RecordForm.jsx';
import { RepeatPicker } from './DatePick.jsx';
import { repeatText, fullDate } from '../data/repeat.js';
import { payScheduled, duePayments, myScheduled, Scheduled } from './Payments.jsx';

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
export { nextDate } from '../data/repeat.js';

export { Scheduled };

export function ScheduledForm({ item, onClose }) {
  const s = useStore();
  const accounts = alive(s.ledger.accounts);
  const [f, setF] = useState(item ? { notifyDay: true, notify3: true, confirm: 'manual', payment: 'Карта', labels: [], ...item, amountText: String(item.amount).replace('.', ',') } : {
    name: '', type: 'expense', amountText: '', accountId: '', categoryId: '', owner: s.settings.me,
    date: '', repeat: 'none', every: 1, weekdays: [], until: '', confirm: 'manual', payment: 'Карта', payee: '', labels: [], note: '', notifyDay: true, notify3: true,
  });
  const [pick, setPick] = useState(null);
  const [tried, setTried] = useState(false);
  const upd = (p) => setF((x) => ({ ...x, ...p }));
  const amount = Number(String(f.amountText).replace(/\s/g, '').replace(',', '.')) || 0;
  const missing = [!amount && 'сумму', !f.name.trim() && 'название', !f.accountId && 'счёт', !f.categoryId && 'категорию', !f.date && 'дату'].filter(Boolean);
  const valid = missing.length === 0;
  const toItem = () => { const { amountText, occ, ...rest } = f; return { ...rest, amount, name: f.name.trim() }; };
  const save = () => { setTried(true); if (!valid) return; upsert('scheduled', toItem()); onClose(); };
  const payNow = () => { setTried(true); if (!valid) return; payScheduled(toItem()); onClose(); };
  const acc = accounts.find((a) => a.id === f.accountId);
  const c = f.categoryId ? category(f.categoryId) : null;
  const req = (ok) => (ok ? '' : 'req');
  if (pick === 'date') return <RepeatPicker value={f} onClose={() => setPick(null)} onDone={(r) => { upd(r); setPick(null); }} />;
  if (pick === 'cat') return <CategoryPicker type={f.type} onPick={(id) => { upd({ categoryId: id }); setPick(null); }} onClose={() => setPick(null)} />;
  return (
    <Sheet title={item ? 'Платёж' : 'Новый платёж'} onClose={onClose}
      left={<button class="link" onClick={onClose}>Отменить</button>}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          {tried && !valid && <div class="error-box" role="alert">Заполните: {missing.join(', ')}</div>}
          <button class="btn primary" onClick={save}>Сохранить</button>
          {item && <button class="btn green" onClick={payNow}>Оплачено — записать</button>}
          {item && <button class="btn danger" onClick={() => { remove('scheduled', item.id); onClose(); }}>Удалить</button>}
        </div>
      }>
      <div style={{ padding: '0 var(--s4) var(--s3)' }}>
        <Segmented light options={[['expense', 'Расход'], ['income', 'Доход']]} value={f.type} onChange={(type) => upd({ type, categoryId: '' })} />
      </div>
      <label class="amount-box">
        <span class="cur">{acc?.currency || 'RUB'}</span>
        <span class="sr-only">Сумма</span>
        <AmountInput cls={f.type} big placeholder={f.type === 'expense' ? '-0' : '0'} autoFocus={!item} value={f.amountText} onChange={(v) => upd({ amountText: v })} />
      </label>

      <div class="group-label">Общие</div>
      <div class="list">
        <label class="row"><span class="ri" aria-hidden="true">🅃</span><span class="rl">Название платежа</span>
          <input class={`input-req${tried && !f.name.trim() ? ' bad' : ''}`} value={f.name} placeholder="Обязательно" onInput={(e) => upd({ name: e.currentTarget.value })} maxLength={60} />
        </label>
        <label class="row"><span class="ri" aria-hidden="true">{acc ? <span class="dot" style={{ background: acc.color, width: 20, height: 20, display: 'inline-block' }} /> : '❓'}</span><span class="rl">Счёт</span>
          <select class={req(f.accountId)} value={f.accountId} onChange={(e) => upd({ accountId: e.currentTarget.value })}>
            {!f.accountId && <option value="">Обязательно</option>}
            <AccountOptions accounts={accounts} me={s.settings.me} />
          </select>
        </label>
        <Row icon={c ? <CatIcon catId={c.id} size={30} /> : <span class="cat-ico" style={{ background: 'var(--surface-2)', width: 30, height: 30, fontSize: 16 }}>?</span>}
          label="Категория" value={c ? c.name : 'Обязательно'} valueClass={req(c)} onClick={() => setPick('cat')} />
        <label class="row"><span class="ri" aria-hidden="true">✔️</span><span class="rl">Подтверждение
          <span class="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>{f.confirm === 'auto' ? 'В день оплаты запись создастся сама' : 'Вы сами отмечаете «Оплачено»'}</span></span>
          <select value={f.confirm} onChange={(e) => upd({ confirm: e.currentTarget.value })}>
            <option value="manual">Вручную</option>
            <option value="auto">Автоматически</option>
          </select>
        </label>
        <div class="row"><span class="ri" aria-hidden="true">👤</span><span class="rl">Чей</span>
          <div class="who">{PEOPLE.map((p) => <button key={p} class={f.owner === p ? 'on' : ''} onClick={() => upd({ owner: p })}><span style={{ color: PERSON_COLOR[p] }}>●</span> {p}</button>)}</div>
        </div>
      </div>

      <div class="group-label">Дата и повтор</div>
      <div class="list">
        <Row icon="📅" label="Дата" value={f.date ? fullDate(f.date) : 'Обязательно'} valueClass={req(f.date)} onClick={() => setPick('date')} />
        {f.date && <Row icon="🔁" label="Повтор" value={repeatText(f)} onClick={() => setPick('date')} />}
      </div>

      <div class="group-label">Подробнее</div>
      <div class="list">
        <label class="row"><span class="ri" aria-hidden="true">💳</span><span class="rl">Тип платежа</span>
          <select value={f.payment} onChange={(e) => upd({ payment: e.currentTarget.value })}>{PAY.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        <label class="row"><span class="ri" aria-hidden="true">👤</span><span class="rl">Получатель</span>
          <input value={f.payee || ''} placeholder="Необязательно" onInput={(e) => upd({ payee: e.currentTarget.value })} maxLength={80} />
        </label>
        <LabelsRow labels={f.labels || []} onChange={(labels) => upd({ labels })} />
        <label class="row"><span class="ri" aria-hidden="true">✍️</span><span class="rl">Заметка</span>
          <input value={f.note || ''} placeholder="Необязательно" onInput={(e) => upd({ note: e.currentTarget.value })} maxLength={140} />
        </label>
      </div>

      <div class="group-label">Уведомления</div>
      <div class="list">
        {[['notifyDay', 'В день оплаты'], ['notify3', 'За 3 дня до даты оплаты']].map(([k, l]) => (
          <button key={k} class="row" role="switch" aria-checked={f[k] !== false} onClick={() => upd({ [k]: f[k] === false })}>
            <span class="ri" aria-hidden="true">🔔</span><span class="rl">{l}</span>
            <span class={`toggle${f[k] !== false ? ' on' : ''}`} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div style={{ height: 'var(--s4)' }} />
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
