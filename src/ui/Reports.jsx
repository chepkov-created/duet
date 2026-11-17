import { useNav } from './App.jsx';
import { Screen } from './kit.jsx';
import { useStore, visibleRecords, PEOPLE } from '../data/store.js';
import { FilterBar, FilterButton } from './Filter.jsx';
import { PersonSwitch } from './Overview.jsx';
import { PERSON_COLOR } from './kit.jsx';
import { totals, byCategory, change } from '../data/periods.js';
import { EXPENSE_GROUPS, INCOME_GROUPS, group } from '../data/categories.js';
import { rub } from '../data/format.js';
import { PeriodDock, usePeriod } from './Period.jsx';
import { Records } from './Records.jsx';

export function Delta({ pct, goodWhenUp }) {
  if (pct === null || pct === undefined || !isFinite(pct)) return <div class="delta none num">– –</div>;
  const good = goodWhenUp ? pct >= 0 : pct <= 0;
  return <div class={`delta num ${good ? 'good' : 'bad'}`}>{pct > 0 ? '+' : ''}{pct}%</div>;
}

export function Reports() {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const recs = visibleRecords(s);
  const t = totals(recs, range);
  const p = totals(recs, range.prev);
  const inc = byCategory(recs, range, 'income'), incP = byCategory(recs, range.prev, 'income');
  const exp = byCategory(recs, range, 'expense'), expP = byCategory(recs, range.prev, 'expense');
  const days = Math.max(1, Math.round((range.to - range.from) / 864e5));

  const GroupRow = ({ g, cur, prev, type }) => {
    const v = cur.groups[g.id] || 0;
    const pv = prev.groups[g.id] || 0;
    const has = v > 0 || pv > 0;
    return (
      <button class="rep-row" disabled={!has} onClick={() => nav.push(GroupReport, { groupId: g.id })}>
        <span class="rl"><span class="dot" style={{ background: g.color }} /><span>{g.name}</span></span>
        <span class="num" style={{ color: v ? (type === 'income' ? 'var(--pos-text)' : 'var(--neg-text)') : 'var(--text)' }}>{rub(type === 'income' ? v : -v, { cur: false })}</span>
        <Delta pct={v || pv ? change(v, pv) : null} goodWhenUp={type === 'income'} />
        <span class="chev" aria-hidden="true">{has ? '›' : ''}</span>
      </button>
    );
  };

  return (
    <Screen pushed title="Отчёты" back="Назад" onBack={nav.pop} right={<FilterButton />}>
      <div style={{ padding: '0 var(--s4) var(--s3)' }}><PersonSwitch /></div>
      <FilterBar />
      <div class="rep" style={{ paddingBottom: 'var(--s2)' }}>
        <div class="rep-head">
          <h2>Доходы и расходы</h2>
          <p>Откуда приходят и куда уходят деньги</p>
        </div>
        <div class="rep-sum">
          <div class="cmp"><span class="caption">{range.label}</span><span class="tiny">к прошлому периоду</span></div>
          <div class="cmp" style={{ alignItems: 'center' }}>
            <span class="big-amount num" style={{ margin: 0 }}>{rub(t.flow)}</span>
            <div style={{ width: 110 }}><Delta pct={change(t.flow, p.flow)} goodWhenUp /></div>
          </div>
        </div>
        <div class="rep-row total"><span class="rl">Доход</span><span class="num">{rub(t.income, { cur: false })}</span><Delta pct={change(t.income, p.income)} goodWhenUp /><span /></div>
        {INCOME_GROUPS.map((g) => <GroupRow key={g.id} g={g} cur={inc} prev={incP} type="income" />)}
        <div class="rep-row total"><span class="rl">Расходы</span><span class="num">{rub(-t.expense, { cur: false })}</span><Delta pct={change(t.expense, p.expense)} /><span /></div>
        {EXPENSE_GROUPS.map((g) => <GroupRow key={g.id} g={g} cur={exp} prev={expP} type="expense" />)}
      </div>

      <ByPerson range={range} />

      <div class="rep" style={{ marginTop: 'var(--s5)', paddingBottom: 'var(--s5)' }}>
        <div class="rep-head"><h2>Движение денег</h2><p>Не слишком ли много уходит?</p></div>
        <div class="rep-sum">
          <div class="caption" style={{ marginBottom: 'var(--s3)' }}>{range.label}</div>
          <div class="flow-table num">
            <span class="h">Сводка</span><span class="h">Доход</span><span class="h neg">Расходы</span>
            <span>Количество</span><span>{t.nIn}</span><span class="neg">{t.nOut}</span>
            <span>В среднем за день</span><span>{rub(t.income / days, { cur: false })}</span><span class="neg">{rub(-t.expense / days, { cur: false })}</span>
            <span>В среднем на запись</span><span>{rub(t.nIn ? t.income / t.nIn : 0, { cur: false })}</span><span class="neg">{rub(t.nOut ? -t.expense / t.nOut : 0, { cur: false })}</span>
            <span>Всего</span><span>{rub(t.income, { cur: false })}</span><span class="neg">{rub(-t.expense, { cur: false })}</span>
          </div>
          <div class="caption" style={{ marginTop: 'var(--s5)' }}>Денежный поток</div>
          <div class="big-amount num">{rub(t.flow)}</div>
        </div>
      </div>
      <div style={{ height: 120 }} />
      <PeriodDock bottom="0px" />
    </Screen>
  );
}

/** Who spent and earned what in the period, with the active filter applied. */
function ByPerson({ range }) {
  const s = useStore();
  const nav = useNav();
  const recs = visibleRecords({ ...s, settings: { ...s.settings, view: 'all' } });
  const rows = PEOPLE.map((p) => {
    const own = recs.filter((r) => r.owner === p);
    return { p, cur: totals(own, range), prev: totals(own, range.prev) };
  });
  const totalExp = rows.reduce((a, r) => a + r.cur.expense, 0);
  return (
    <div class="rep" style={{ marginTop: 'var(--s5)' }}>
      <div class="rep-head"><h2>По людям</h2><p>Кто сколько потратил и заработал</p></div>
      {rows.map(({ p, cur, prev }) => (
        <button key={p} class="person-rep" onClick={() => nav.push(Records, { title: p, range, back: 'Отчёты', owner: p })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span class="dot" style={{ background: PERSON_COLOR[p] }} />
            <b style={{ flex: 1, textAlign: 'left' }}>{p}</b>
            <span class="muted">{totalExp ? Math.round((cur.expense / totalExp) * 100) : 0}% расходов</span>
            <span class="chev" aria-hidden="true">›</span>
          </div>
          <div class="person-grid num">
            <span class="muted">Доход</span><span style={{ color: 'var(--pos-text)' }}>{rub(cur.income, { cur: false })}</span><Delta pct={change(cur.income, prev.income)} goodWhenUp />
            <span class="muted">Расходы</span><span style={{ color: 'var(--neg-text)' }}>{rub(-cur.expense, { cur: false })}</span><Delta pct={change(cur.expense, prev.expense)} />
          </div>
          <div class="progress"><div style={{ width: `${totalExp ? (cur.expense / totalExp) * 100 : 0}%`, background: PERSON_COLOR[p] }} /></div>
        </button>
      ))}
    </div>
  );
}

export function GroupReport({ groupId }) {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const g = group(groupId);
  const recs = visibleRecords(s);
  const cur = byCategory(recs, range, g.type), prev = byCategory(recs, range.prev, g.type);
  return (
    <Screen pushed title={g.name} back="Отчёты" onBack={nav.pop} right={<FilterButton />}>
      <FilterBar />
      <div class="rep">
        {g.subs.map((name, i) => {
          const id = `${g.id}.${i}`;
          const v = cur.cats[id] || 0, pv = prev.cats[id] || 0;
          return (
            <button key={id} class="rep-row" disabled={!v} onClick={() => nav.push(Records, { title: name, categoryIds: [id], range, back: g.name })}>
              <span class="rl"><span class="dot" style={{ background: g.color }} /><span>{name}</span></span>
              <span class="num" style={{ color: v ? (g.type === 'income' ? 'var(--pos-text)' : 'var(--neg-text)') : 'var(--text)' }}>{rub(g.type === 'income' ? v : -v, { cur: false })}</span>
              <Delta pct={v || pv ? change(v, pv) : null} goodWhenUp={g.type === 'income'} />
              <span class="chev" aria-hidden="true">{v ? '›' : ''}</span>
            </button>
          );
        })}
      </div>
      <div style={{ height: 120 }} />
      <PeriodDock bottom="0px" />
    </Screen>
  );
}
