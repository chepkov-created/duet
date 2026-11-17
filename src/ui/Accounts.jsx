import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, Row, Empty, Sheet, PERSON_COLOR } from './kit.jsx';
import { useStore, alive, upsert, upsertMany, remove, accountBalance, toRub, PEOPLE, CURRENCIES } from '../data/store.js';
import { rub, fmt } from '../data/format.js';
import { Records } from './Records.jsx';

const KINDS = [['cash', 'Наличные'], ['bank', 'Банковская карта'], ['savings', 'Накопления'], ['credit', 'Кредитная карта']];
const COLORS = ['var(--acc-red)', 'var(--acc-sber)', 'var(--acc-psb)', 'var(--acc-tbank)', 'var(--acc-ozon)', 'var(--acc-gold)', 'var(--acc-violet)', 'var(--acc-teal)'];
export const ACC_ICON = { cash: '💵', bank: '💳', savings: '🐷', credit: '💳' };

/** "Сбер · Арина" — needed because both of you have a Сбер card */
export const accLabel = (a) => (a ? (a.owner ? `${a.name} · ${a.owner}` : a.name) : '—');

/** Accounts split into sections: each person, then shared. `me` goes first. */
/** Saved order ("Изменить порядок"), then the original one. */
export const sortAccounts = (accounts) => accounts.map((a, i) => [a, i]).sort((x, y) => (x[0].order ?? x[1] * 10) - (y[0].order ?? y[1] * 10) || x[1] - y[1]).map(([a]) => a);

export function accountSections(accounts, me) {
  accounts = sortAccounts(accounts);
  const people = [...PEOPLE].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));
  return [
    ...people.map((p) => ({ key: p, title: p, color: PERSON_COLOR[p], items: accounts.filter((a) => a.owner === p) })),
    { key: 'shared', title: 'Общие', color: 'var(--acc-gold)', items: accounts.filter((a) => !a.owner || !PEOPLE.includes(a.owner)) },
  ].filter((s) => s.items.length);
}

/** <select> options grouped by person, for forms. */
export const AccountOptions = ({ accounts, me }) => accountSections(accounts, me).map((sec) => (
  <optgroup key={sec.key} label={sec.title}>
    {sec.items.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency && a.currency !== 'RUB' ? ` (${CURRENCIES[a.currency]})` : ''}{a.owner ? ` · ${a.owner}` : ''}</option>)}
  </optgroup>
));

export function Accounts() {
  const s = useStore();
  const nav = useNav();
  const [ordering, setOrdering] = useState(false);
  const accounts = alive(s.ledger.accounts);
  const recs = alive(s.ledger.records);
  const bal = (a) => accountBalance(a, recs);
  const total = accounts.reduce((sum, a) => sum + toRub(bal(a), a.currency), 0);
  // Move one place up/down inside its section; the whole section gets fresh order numbers so both phones agree.
  const move = (items, i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const list = [...items];
    [list[i], list[j]] = [list[j], list[i]];
    const base = Math.min(...items.map((a, k) => a.order ?? k * 10));
    upsertMany('accounts', list.map((a, k) => ({ ...a, order: base + k * 10 })));
  };
  return (
    <Screen pushed title="Счета" back="Назад" onBack={nav.pop}
      right={<>
        <button class="link" onClick={() => setOrdering(!ordering)}>{ordering ? 'Готово' : 'Порядок'}</button>
        {!ordering && <button class="link" onClick={() => nav.push(AccountForm, {})}>Добавить</button>}
      </>}>
      <div class="group-label">Всего в рублях: <span class="num">{rub(total)}</span></div>
      {ordering && <div class="note-box">Стрелками меняйте порядок — так же счета будут стоять на Обзоре. Карты одной папки на Обзоре стоят там, где первая из них.</div>}
      {accounts.length === 0 && <Empty icon="🏛️" text="Счетов нет" />}
      {accountSections(accounts, s.settings.me).map((sec) => (
        <div key={sec.key}>
          <div class="group-label"><span style={{ color: sec.color }}>●</span> {sec.title} · <span class="num">{rub(sec.items.reduce((x, a) => x + toRub(bal(a), a.currency), 0))}</span></div>
          <div class="list inset">
            {sec.items.map((a, i) => ordering ? (
              <div key={a.id} class="row">
                <span class="ri"><span class="dot" style={{ background: a.color, width: 18, height: 18 }} /></span>
                <span class="rl">{a.name}{a.group ? <span class="muted"> · 🗂️ {a.group}</span> : ''}</span>
                <button class="order-btn" aria-label={`Выше: ${a.name}`} disabled={i === 0} onClick={() => move(sec.items, i, -1)}>↑</button>
                <button class="order-btn" aria-label={`Ниже: ${a.name}`} disabled={i === sec.items.length - 1} onClick={() => move(sec.items, i, 1)}>↓</button>
              </div>
            ) : (
              <Row key={a.id} icon={<span class="dot" style={{ background: a.color, width: 18, height: 18 }} />}
                label={<>{a.name}{a.group ? <span class="muted"> · 🗂️ {a.group}</span> : ''}</>}
                value={fmt(bal(a), a.currency)} onClick={() => nav.push(AccountForm, { account: a })} />
            ))}
          </div>
        </div>
      ))}
      <RatesNote />
    </Screen>
  );
}

/** A bank folder: total on top, every card separately below. */
export function AccountFolder({ group, owner }) {
  const s = useStore();
  const nav = useNav();
  const recs = alive(s.ledger.records);
  const items = sortAccounts(alive(s.ledger.accounts)).filter((a) => a.group === group && (a.owner || '') === (owner || ''));
  const bal = (a) => accountBalance(a, recs);
  const total = items.reduce((x, a) => x + toRub(bal(a), a.currency), 0);
  const rename = () => {
    const n = prompt('Название папки', group);
    if (n && n.trim() && n.trim() !== group) { upsertMany('accounts', items.map((a) => ({ ...a, group: n.trim() }))); nav.pop(); }
  };
  return (
    <Screen pushed title={group} back="Обзор" onBack={nav.pop} right={<button class="link" onClick={rename}>Переименовать</button>}>
      <div class="card" style={{ margin: '0 var(--s4) var(--s3)' }}>
        <div class="caption">Всего в папке{owner ? ` · ${owner}` : ''}</div>
        <div class="big-amount num">{rub(total)}</div>
        <button class="pill-btn" onClick={() => nav.push(Records, { accountId: items.map((a) => a.id), title: group })}>Все операции папки</button>
      </div>
      <div class="list inset">
        {items.map((a) => (
          <Row key={a.id} icon={<span class="dot" style={{ background: a.color, width: 18, height: 18 }} />} label={a.name}
            value={fmt(bal(a), a.currency)} onClick={() => nav.push(Records, { accountId: a.id, title: accLabel(a) })} />
        ))}
      </div>
      <div class="note-box">Чтобы добавить карту в папку или убрать из неё — откройте карту → «Настройки счёта» → поле «Объединить в».</div>
    </Screen>
  );
}

export function RatesNote() {
  const s = useStore();
  const r = s.settings.rates || {};
  if (!r.USD) return <div class="note-box">Курсы валют ещё не загружены: суммы в $ и € пока не пересчитаны в рубли. Нужен интернет или ручной ввод курса в Настройках.</div>;
  return <div class="note-box">Курс для пересчёта: $ = {rub(r.USD)}, € = {rub(r.EUR)} {r.manual ? '(задан вручную)' : `(ЦБ, ${new Date(r.at).toLocaleDateString('ru-RU')})`}</div>;
}

/** Creates a correction record so the account shows `target`. Returns false when nothing changes. */
export function adjustBalance(account, current, target, me) {
  const diff = Math.round((target - current) * 100) / 100;
  if (!diff) return false;
  upsert('records', {
    type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), accountId: account.id, categoryId: 'adj.0',
    date: new Date().toISOString(), owner: account.owner || me, labels: [], note: 'Изменение баланса счёта', payee: '', status: 'done', payment: '',
  });
  return true;
}

/** Sheet: type the real balance, a correction record is added for the difference. */
export function AdjustBalance({ account, current, onClose }) {
  const s = useStore();
  const [text, setText] = useState(String(Math.round(current * 100) / 100).replace('.', ','));
  const target = Number(String(text).replace(/\s/g, '').replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(target);
  const diff = valid ? target - current : 0;
  const save = () => { if (valid) adjustBalance(account, current, target, s.settings.me); onClose(); };
  return (
    <Sheet short title="Изменить баланс" onClose={onClose} right={<button class="link strong" onClick={save} disabled={!valid}>Готово</button>}
      footer={<button class="btn primary" disabled={!valid || !diff} onClick={save}>Сохранить</button>}>
      <div class="note-box">Сейчас в приложении: <b class="num">{fmt(current, account.currency)}</b>. Введите, сколько на счёте на самом деле. Разница запишется как «Изменение баланса счёта» и не попадёт в траты и доходы.</div>
      <label class="amount-box">
        <span class="cur">{account.currency || 'RUB'}</span>
        <span class="sr-only">Реальный баланс</span>
        <input class="amount-input num transfer" inputMode="decimal" autoFocus value={text} onInput={(e) => setText(e.currentTarget.value.replace(/[^\d.,\s-]/g, ''))} />
      </label>
      {valid && diff !== 0 && <div class="note-box">Будет записано: <b class="num" style={{ color: diff > 0 ? 'var(--pos-text)' : 'var(--neg-text)' }}>{fmt(diff, account.currency, { sign: true })}</b></div>}
    </Sheet>
  );
}

export function AccountForm({ account }) {
  const nav = useNav();
  const s = useStore();
  const recs = alive(s.ledger.records);
  const [f, setF] = useState(account || { name: '', kind: 'bank', color: COLORS[1], initial: 0, owner: s.settings.me, currency: 'RUB', group: '' });
  const current = account ? accountBalance(account, recs) : null;
  const [balance, setBalance] = useState(current !== null ? String(Math.round(current * 100) / 100).replace('.', ',') : '0');
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });
  const save = () => {
    if (!f.name.trim()) return;
    const typed = Number(String(balance).replace(/\s/g, '').replace(',', '.'));
    if (account) {
      // Existing account: keep the start, record the difference as "Изменение баланса счёта" (like Wallet does).
      upsert('accounts', { ...f, name: f.name.trim(), group: (f.group || '').trim() || undefined });
      if (Number.isFinite(typed)) adjustBalance(account, current, typed, s.settings.me);
    } else {
      upsert('accounts', { ...f, name: f.name.trim(), group: (f.group || '').trim() || undefined, initial: Number.isFinite(typed) ? typed : 0 });
    }
    nav.pop();
  };
  const del = () => {
    const used = recs.some((r) => r.accountId === account.id || r.toAccountId === account.id);
    if (!confirm(used ? 'По этому счёту есть записи. Удалить счёт? Записи останутся, но без счёта.' : 'Удалить счёт?')) return;
    remove('accounts', account.id);
    nav.pop();
  };
  return (
    <Screen pushed title={account ? 'Счёт' : 'Новый счёт'} back="Назад" onBack={nav.pop} right={<button class="link strong" onClick={save} disabled={!f.name.trim()}>Готово</button>}>
      <div class="list inset">
        <label class="row"><span class="rl">Название</span><input value={f.name} onInput={set('name')} placeholder="Например, Т-Банк" maxLength={40} /></label>
        <label class="row"><span class="rl">Чей</span>
          <select value={f.owner || ''} onChange={set('owner')}>
            {PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="">Общий</option>
          </select>
        </label>
        <label class="row"><span class="rl">Тип</span>
          <select value={f.kind} onChange={set('kind')}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label class="row"><span class="rl">Валюта</span>
          <select value={f.currency || 'RUB'} onChange={set('currency')} disabled={Boolean(account) && recs.some((r) => r.accountId === account.id)}>
            <option value="RUB">Рубли ₽</option><option value="USD">Доллары $</option><option value="EUR">Евро €</option>
          </select>
        </label>
        <label class="row"><span class="rl">Баланс сейчас, {CURRENCIES[f.currency || 'RUB']}{account && <span class="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>изменение запишется отдельной записью</span>}</span><input inputMode="decimal" value={balance} onInput={(e) => setBalance(e.currentTarget.value)} /></label>
        <label class="row"><span class="rl">Объединить в</span><input value={f.group || ''} onInput={set('group')} placeholder="Папка, например «ПСБ»" maxLength={30} /></label>
        <div class="row"><span class="rl">Цвет</span>
          <div class="swatches">{COLORS.map((c) => <button key={c} aria-label="Цвет" class={f.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setF({ ...f, color: c })} />)}</div>
        </div>
      </div>
      <div class="note-box">Счета с одинаковым «Объединить в» становятся на Обзоре одной папкой с общей суммой, например «ПСБ» с двумя картами или «Подушка» в рублях, долларах и евро. Нажмите на папку, чтобы увидеть каждую карту.</div>
      {account && (
        <div style={{ padding: 'var(--s4)', display: 'grid', gap: 8 }}>
          <button class="btn" onClick={() => nav.push(Records, { accountId: account.id, title: accLabel(account) })}>Записи по счёту</button>
          <button class="btn danger" onClick={del}>Удалить счёт</button>
        </div>
      )}
    </Screen>
  );
}
