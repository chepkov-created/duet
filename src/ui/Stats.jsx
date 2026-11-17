import { useNav } from './App.jsx';
import { Screen } from './kit.jsx';
import { MiniDonut, Area } from './charts.jsx';
import { useStore, alive, visibleRecords } from '../data/store.js';
import { totals, byCategory, balanceSeries, change } from '../data/periods.js';
import { GROUPS } from '../data/categories.js';
import { rub } from '../data/format.js';
import { PeriodDock, usePeriod } from './Period.jsx';
import { Reports, Delta } from './Reports.jsx';
import { Accounts } from './Accounts.jsx';
import { Scheduled } from './Planning.jsx';
import { PersonSwitch } from './Overview.jsx';
import { FilterBar, FilterButton } from './Filter.jsx';
import { BalanceScreen, ExpensesScreen, CashFlowScreen } from './Analytics.jsx';

export function Stats() {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const accounts = alive(s.ledger.accounts);
  const all = alive(s.ledger.records);
  const recs = visibleRecords(s);
  const t = totals(recs, range);
  const prev = totals(recs, range.prev);
  const series = balanceSeries(accounts, all, 30);
  const { groups } = byCategory(recs, range);
  const parts = GROUPS.filter((g) => groups[g.id]).map((g) => ({ key: g.id, value: groups[g.id], color: g.color }));
  const forecast = alive(s.ledger.scheduled)
    .filter((x) => (s.settings.view === 'all' || x.owner === s.settings.view) && new Date(x.date) <= new Date(Date.now() + 30 * 864e5))
    .reduce((a, x) => a + (x.type === 'expense' ? x.amount : -x.amount), 0);
  const max = Math.max(t.income, t.expense, 1);
  const open = () => nav.push(Reports, {});

  return (
    <Screen title="Статистика" right={<FilterButton />}>
      <div style={{ padding: '0 var(--s4)' }}><PersonSwitch /></div>
      <FilterBar />
      <div class="stack" style={{ paddingBottom: 140 }}>
        <Tile label="Баланс" value={rub(series[series.length - 1]?.value || 0)} onClick={() => nav.push(BalanceScreen, {})}>
          <div style={{ width: 74 }}><Area series={series} height={56} mini /></div>
        </Tile>
        <Tile label="Расходы" value={rub(t.expense)} onClick={() => nav.push(ExpensesScreen, {})}><MiniDonut parts={parts} /></Tile>
        <Tile label="Денежный поток" value={rub(t.flow)} onClick={() => nav.push(CashFlowScreen, {})}>
          <div style={{ width: 74, display: 'grid', gap: 8 }}>
            <div class="bar" style={{ height: 14, borderRadius: 2 }}><div style={{ width: `${(t.income / max) * 100}%`, background: 'var(--pos)', borderRadius: 2 }} /></div>
            <div class="bar" style={{ height: 14, borderRadius: 2 }}><div style={{ width: `${(t.expense / max) * 100}%`, background: 'var(--neg)', borderRadius: 2 }} /></div>
          </div>
        </Tile>
        <Tile label="Платежи на 30 дней" value={rub(forecast)} onClick={() => nav.push(Scheduled, {})}>
          <div style={{ width: 3, height: 56, background: 'var(--cat-teal)', borderRadius: 2 }} />
        </Tile>
        <button class="tile" onClick={open}>
          <div class="tl">
            <div class="caption">Отчёт — доход</div>
            <div class="tv num">{rub(t.income)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase' }}>к прошлому периоду</span>
            <div style={{ width: 90 }}><Delta pct={change(t.income, prev.income)} goodWhenUp /></div>
          </div>
        </button>
      </div>
      <PeriodDock />
    </Screen>
  );
}

const Tile = ({ label, value, children, onClick }) => (
  <button class="tile" onClick={onClick}>
    <div class="tl"><div class="caption">{label}</div><div class="tv num">{value}</div></div>
    <div class="tg">{children}</div>
  </button>
);
