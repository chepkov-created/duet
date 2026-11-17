import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, RecordRow, Empty, SwipeRow } from './kit.jsx';
import { useStore, alive, visibleRecords, inRub, hiddenFromMe, remove, undoDelete } from '../data/store.js';
import { category, groupOf, natureOfRecord, NATURE_NAME } from '../data/categories.js';
import { dayLabel, fmt, dayStart } from '../data/format.js';
import { effectOn, accountBalance } from '../data/store.js';
import { AdjustBalance, AccountForm } from './Accounts.jsx';
import { PersonSwitch } from './Overview.jsx';
import { FilterBar, FilterButton } from './Filter.jsx';

/** Delete with a confirmation; the toast and a shake can bring it back. */
export function deleteRecord(nav, r) {
  const c = category(r.categoryId);
  const what = `${r.type === 'transfer' ? 'Перевод' : c.name}${r.note ? ` («${r.note.slice(0, 30)}»)` : ''} на ${fmt(r.orig ? r.orig.amount : r.amount, r.orig?.currency)}`;
  if (!confirm(`Удалить запись?
${what}`)) return;
  remove('records', r.id);
  nav.toast('Запись удалена', () => undoDelete());
}

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const TYPE_WORDS = { expense: 'расход трата', income: 'доход поступление', transfer: 'перевод' };
const MONTHS = ['январь января', 'февраль февраля', 'март марта', 'апрель апреля', 'май мая', 'июнь июня', 'июль июля', 'август августа', 'сентябрь сентября', 'октябрь октября', 'ноябрь ноября', 'декабрь декабря'];

/** Everything a record can be found by: note, payee, labels, category and its group, account, person, type, date, amount in several spellings. */
function searchText(r, accounts) {
  const c = category(r.categoryId);
  const acc = (id) => accounts.find((a) => a.id === id);
  const d = new Date(r.date);
  const a = r.orig ? r.orig.amount : r.amount;
  const whole = Math.trunc(a);
  return norm([
    r.note, r.payee, ...(r.labels || []), ...(r.items || []).map((it) => it.name), r.owner,
    r.categoryId ? c.name : '', r.categoryId ? groupOf(r.categoryId)?.name : '',
    acc(r.accountId)?.name, acc(r.toAccountId)?.name, TYPE_WORDS[r.type], NATURE_NAME[natureOfRecord(r)],
    `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`,
    String(a), String(a).replace('.', ','), a.toFixed(2), a.toFixed(2).replace('.', ','), String(whole), whole.toLocaleString('ru-RU').replace(/\s/g, ' '), r.source,
  ].filter(Boolean).join(' | '));
}

export function Records({ accountId, categoryIds, title = 'Записи', range, back = 'Назад', owner, initialQuery, everything, ids }) {
  const s = useStore();
  const nav = useNav();
  const [q, setQ] = useState(initialQuery || '');
  const [limit, setLimit] = useState(200);
  const [adjusting, setAdjusting] = useState(false);
  const accounts = alive(s.ledger.accounts);
  const accIds = accountId ? [].concat(accountId) : null;
  const singleAcc = accIds?.length === 1 ? accounts.find((a) => a.id === accIds[0]) : null;
  // One account: amounts in its own currency. Several or none: everything in rubles.
  let recs = accIds
    ? alive(s.ledger.records).filter((r) => !hiddenFromMe(r, s)).filter((r) => accIds.includes(r.accountId) || accIds.includes(r.toAccountId)).map((r) => (singleAcc ? r : inRub(r, s)))
    : visibleRecords(s);
  if (owner) recs = visibleRecords({ ...s, settings: { ...s.settings, view: owner } });
  // Search: whoever the switch shows (yourself by default), without category/account filters.
  if (everything) recs = visibleRecords(s, { ignoreFilter: true });
  if (categoryIds) recs = recs.filter((r) => categoryIds.includes(r.categoryId) || (r.items || []).some((it) => categoryIds.includes(it.categoryId)));
  if (ids) { const set = new Set(ids); recs = recs.filter((r) => set.has(r.id)); }
  if (range) recs = recs.filter((r) => { const d = new Date(r.date); return d >= range.from && d <= range.to; });
  const needle = norm(q);
  if (needle) {
    // Every word must be found somewhere in the record: "кофе арина" = coffee records of Arina.
    const words = needle.split(' ');
    recs = recs.filter((r) => { const hay = searchText(r, accounts); return words.every((w) => hay.includes(w)); });
  }
  recs = [...recs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const total = recs.length;
  recs = recs.slice(0, limit);
  const days = [];
  for (const r of recs) {
    const key = dayStart(r.date).getTime();
    if (!days.length || days[days.length - 1].key !== key) days.push({ key, items: [] });
    days[days.length - 1].items.push(r);
  }
  return (
    <Screen pushed title={title} back={back} onBack={nav.pop} right={<>{!accountId && !everything && <FilterButton />}<button class="link" onClick={() => nav.record(null, singleAcc ? { accountId: singleAcc.id } : undefined)}>Добавить</button></>}>
      {!accountId && <div style={{ padding: '0 var(--s4) var(--s3)' }}><PersonSwitch /></div>}
      {!accountId && !everything && <FilterBar />}
      {singleAcc && (() => {
        const bal = accountBalance(singleAcc, alive(s.ledger.records));
        return (
          <div class="card" style={{ margin: '0 var(--s4) var(--s3)' }}>
            <div class="caption">Баланс</div>
            <div class="big-amount num">{fmt(bal, singleAcc.currency)}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button class="pill-btn" onClick={() => setAdjusting(true)}>✎ Изменить баланс</button>
              <button class="pill-btn" onClick={() => nav.push(AccountForm, { account: singleAcc })}>⚙️ Настройки счёта</button>
            </div>
            {adjusting && <AdjustBalance account={singleAcc} current={bal} onClose={() => setAdjusting(false)} />}
          </div>
        );
      })()}
      <label class="search">
        <span aria-hidden="true">🔍</span>
        <span class="sr-only">Поиск по записям</span>
        <input type="search" placeholder="Заметка, магазин, категория, сумма, дата…" value={q} autoFocus={Boolean(initialQuery !== undefined)}
          onInput={(e) => { setQ(e.currentTarget.value); setLimit(200); }} />
      </label>
      {needle && total > 0 && <div class="note-box">Найдено: {total}</div>}
      {days.length === 0 && <Empty icon="🧾" text={needle ? 'Ничего не нашлось' : 'Записей нет'} />}
      {days.map((d) => {
        const sum = d.items.reduce((a, r) => a + (singleAcc ? effectOn(r, singleAcc.id) : r.type === 'income' ? r.amount : r.type === 'expense' ? -r.amount : 0), 0);
        return (
          <section key={d.key}>
            <div class="day-head"><span>{dayLabel(d.items[0].date)}</span><span class="num">{fmt(sum, singleAcc?.currency)}</span></div>
            <div class="day-list">
              {d.items.map((r) => <SwipeRow key={r.id} onDelete={() => deleteRecord(nav, r)}><RecordRow r={r} accounts={accounts} onClick={() => nav.record(r)} /></SwipeRow>)}
            </div>
          </section>
        );
      })}
      {total > limit && (
        <div style={{ padding: 'var(--s4)' }}><button class="btn" onClick={() => setLimit(limit + 300)}>Показать ещё ({total - limit})</button></div>
      )}
    </Screen>
  );
}
