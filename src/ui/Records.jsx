import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, RecordRow, Empty } from './kit.jsx';
import { useStore, alive, visibleRecords, inRub } from '../data/store.js';
import { category } from '../data/categories.js';
import { dayLabel, fmt, dayStart } from '../data/format.js';
import { effectOn } from '../data/store.js';
import { PersonSwitch } from './Overview.jsx';
import { FilterBar, FilterButton } from './Filter.jsx';

export function Records({ accountId, categoryIds, title = 'Записи', range, back = 'Назад', owner }) {
  const s = useStore();
  const nav = useNav();
  const [q, setQ] = useState('');
  const accounts = alive(s.ledger.accounts);
  const accIds = accountId ? [].concat(accountId) : null;
  const singleAcc = accIds?.length === 1 ? accounts.find((a) => a.id === accIds[0]) : null;
  // One account: amounts in its own currency. Several or none: everything in rubles.
  let recs = accIds
    ? alive(s.ledger.records).filter((r) => accIds.includes(r.accountId) || accIds.includes(r.toAccountId)).map((r) => (singleAcc ? r : inRub(r, s)))
    : visibleRecords(s);
  if (owner) recs = visibleRecords({ ...s, settings: { ...s.settings, view: owner } });
  if (categoryIds) recs = recs.filter((r) => categoryIds.includes(r.categoryId));
  if (range) recs = recs.filter((r) => { const d = new Date(r.date); return d >= range.from && d <= range.to; });
  const needle = q.trim().toLowerCase();
  if (needle) {
    recs = recs.filter((r) => [category(r.categoryId).name, r.note, r.payee, r.owner, String(r.amount)].some((f) => f && String(f).toLowerCase().includes(needle)));
  }
  recs = [...recs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const days = [];
  for (const r of recs) {
    const key = dayStart(r.date).getTime();
    if (!days.length || days[days.length - 1].key !== key) days.push({ key, items: [] });
    days[days.length - 1].items.push(r);
  }
  return (
    <Screen pushed title={title} back={back} onBack={nav.pop} right={<>{!accountId && <FilterButton />}<button class="link" onClick={() => nav.record(null, singleAcc ? { accountId: singleAcc.id } : undefined)}>Добавить</button></>}>
      {!accountId && <div style={{ padding: '0 var(--s4) var(--s3)' }}><PersonSwitch /></div>}
      {!accountId && <FilterBar />}
      <label class="search">
        <span aria-hidden="true">🔍</span>
        <span class="sr-only">Поиск по записям</span>
        <input type="search" placeholder="Поиск: категория, заметка, сумма" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </label>
      {days.length === 0 && <Empty icon="🧾" text={needle ? 'Ничего не нашлось' : 'Записей нет'} />}
      {days.map((d) => {
        const sum = d.items.reduce((a, r) => a + (singleAcc ? effectOn(r, singleAcc.id) : r.type === 'income' ? r.amount : r.type === 'expense' ? -r.amount : 0), 0);
        return (
          <section key={d.key}>
            <div class="day-head"><span>{dayLabel(d.items[0].date)}</span><span class="num">{fmt(sum, singleAcc?.currency)}</span></div>
            <div class="day-list">
              {d.items.map((r) => <RecordRow key={r.id} r={r} accounts={accounts} onClick={() => nav.record(r)} />)}
            </div>
          </section>
        );
      })}
    </Screen>
  );
}
