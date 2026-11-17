import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, Row, Empty, PERSON_COLOR } from './kit.jsx';
import { useStore, alive, upsert, remove, accountBalance, toRub, PEOPLE, CURRENCIES } from '../data/store.js';
import { rub, fmt } from '../data/format.js';
import { Records } from './Records.jsx';

const KINDS = [['cash', 'Наличные'], ['bank', 'Банковская карта'], ['savings', 'Накопления'], ['credit', 'Кредитная карта']];
const COLORS = ['var(--acc-red)', 'var(--acc-sber)', 'var(--acc-psb)', 'var(--acc-tbank)', 'var(--acc-ozon)', 'var(--acc-gold)', 'var(--acc-violet)', 'var(--acc-teal)'];
export const ACC_ICON = { cash: '💵', bank: '💳', savings: '🐷', credit: '💳' };

/** "Сбер · Арина" — needed because both of you have a Сбер card */
export const accLabel = (a) => (a ? (a.owner ? `${a.name} · ${a.owner}` : a.name) : '—');

/** Accounts split into sections: each person, then shared. `me` goes first. */
export function accountSections(accounts, me) {
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
  const accounts = alive(s.ledger.accounts);
  const recs = alive(s.ledger.records);
  const bal = (a) => accountBalance(a, recs);
  const total = accounts.reduce((sum, a) => sum + toRub(bal(a), a.currency), 0);
  return (
    <Screen pushed title="Счета" back="Назад" onBack={nav.pop} right={<button class="link" onClick={() => nav.push(AccountForm, {})}>Добавить</button>}>
      <div class="group-label">Всего в рублях: <span class="num">{rub(total)}</span></div>
      {accounts.length === 0 && <Empty icon="🏛️" text="Счетов нет" />}
      {accountSections(accounts, s.settings.me).map((sec) => (
        <div key={sec.key}>
          <div class="group-label"><span style={{ color: sec.color }}>●</span> {sec.title} · <span class="num">{rub(sec.items.reduce((x, a) => x + toRub(bal(a), a.currency), 0))}</span></div>
          <div class="list inset">
            {sec.items.map((a) => (
              <Row key={a.id} icon={<span class="dot" style={{ background: a.color, width: 18, height: 18 }} />} label={a.name}
                value={fmt(bal(a), a.currency)} onClick={() => nav.push(AccountForm, { account: a })} />
            ))}
          </div>
        </div>
      ))}
      <RatesNote />
    </Screen>
  );
}

export function RatesNote() {
  const s = useStore();
  const r = s.settings.rates || {};
  if (!r.USD) return <div class="note-box">Курсы валют ещё не загружены: суммы в $ и € пока не пересчитаны в рубли. Нужен интернет или ручной ввод курса в Настройках.</div>;
  return <div class="note-box">Курс для пересчёта: $ = {rub(r.USD)}, € = {rub(r.EUR)} {r.manual ? '(задан вручную)' : `(ЦБ, ${new Date(r.at).toLocaleDateString('ru-RU')})`}</div>;
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
    // The user types the balance they see now; the starting balance is derived from it.
    const movement = account ? current - (Number(account.initial) || 0) : 0;
    upsert('accounts', { ...f, name: f.name.trim(), group: (f.group || '').trim() || undefined, initial: Number(String(balance).replace(/\s/g, '').replace(',', '.')) - movement });
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
        <label class="row"><span class="rl">Баланс сейчас, {CURRENCIES[f.currency || 'RUB']}</span><input inputMode="decimal" value={balance} onInput={(e) => setBalance(e.currentTarget.value)} /></label>
        <label class="row"><span class="rl">Объединить в</span><input value={f.group || ''} onInput={set('group')} placeholder="Необязательно, например «Подушка»" maxLength={30} /></label>
        <div class="row"><span class="rl">Цвет</span>
          <div class="swatches">{COLORS.map((c) => <button key={c} aria-label="Цвет" class={f.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setF({ ...f, color: c })} />)}</div>
        </div>
      </div>
      <div class="note-box">Счета с одинаковым «Объединить в» показываются на Обзоре одной плиткой, например «Подушка» в рублях, долларах и евро.</div>
      {account && (
        <div style={{ padding: 'var(--s4)', display: 'grid', gap: 8 }}>
          <button class="btn" onClick={() => nav.push(Records, { accountId: account.id, title: accLabel(account) })}>Записи по счёту</button>
          <button class="btn danger" onClick={del}>Удалить счёт</button>
        </div>
      )}
    </Screen>
  );
}
