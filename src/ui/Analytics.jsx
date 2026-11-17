// Detail screens behind the Overview / Statistics tiles: Расходы, Баланс, Денежный поток.
import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, Segmented, Card, PERSON_COLOR } from './kit.jsx';
import { PieDonut, DayBars, Lines, Pager, dayBuckets } from './viz.jsx';
import { useStore, alive, visibleRecords, visibleAccounts, accountBalance, toRub, CURRENCIES } from '../data/store.js';
import { totals, inRange, splitByItems, change } from '../data/periods.js';
import { GROUPS, group, category, natureOf, NATURES, NATURE_NAME, NATURE_COLOR } from '../data/categories.js';
import { rub, fmt, addDays, dayStart, addMonths } from '../data/format.js';
import { PeriodDock, usePeriod } from './Period.jsx';
import { Records } from './Records.jsx';
import { Delta } from './Reports.jsx';
import { accountSections, accLabel, sortAccounts } from './Accounts.jsx';

const OWNER_COLORS = ['var(--cat-teal)', 'var(--cat-orange)', 'var(--cat-lime)', 'var(--cat-violet)', 'var(--cat-pink)'];
const Section = ({ title, sub, children, right }) => (
  <section class="an-sec">
    <div class="an-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{right}</div>
    {children}
  </section>
);

/* ---------- shared: expense parts by group / sub / owner ---------- */
function expenseParts(recs, range, mode, groupId) {
  const sums = {};
  const recIds = {};
  for (const r of recs) {
    if (r.type !== 'expense' || !inRange(r, range)) continue;
    if (mode === 'labels') {
      for (const k of [r.owner || 'Без метки', ...(r.labels || [])]) { sums[k] = (sums[k] || 0) + r.amount; (recIds[k] ||= new Set()).add(r.id); }
      continue;
    }
    for (const [cid, v] of splitByItems(r)) {
      const c = category(cid);
      if (groupId && c.group !== groupId) continue;
      const k = groupId ? c.id : c.group;
      sums[k] = (sums[k] || 0) + v;
      (recIds[k] ||= new Set()).add(r.id);
    }
  }
  let parts;
  if (mode === 'labels') parts = Object.keys(sums).map((k, i) => ({ key: k, name: k, value: sums[k], color: PERSON_COLOR[k] || OWNER_COLORS[i % OWNER_COLORS.length] }));
  else if (groupId) {
    const g = group(groupId);
    parts = Object.keys(sums).map((k, i) => ({ key: k, name: category(k).name, value: sums[k], color: shade(g.color, i) }));
  } else parts = GROUPS.filter((g) => sums[g.id]).map((g) => ({ key: g.id, name: g.name, value: sums[g.id], color: g.color }));
  return { parts: parts.sort((a, b) => b.value - a.value), recIds };
}
const shade = (color, i) => `color-mix(in srgb, ${color} ${100 - (i % 5) * 16}%, #000)`;

/** expense per day for the records that pass `pick(r)` (with receipt items split by category) */
function dailyExpense(recs, range, share) {
  const buckets = dayBuckets(range.from, Math.min(range.to, new Date(new Date().setHours(23, 59, 59, 999))));
  return buckets.map((b) => {
    let v = 0;
    for (const r of recs) {
      if (r.type !== 'expense' || !inRange(r, { from: b.start, to: b.end })) continue;
      v += share(r);
    }
    return { date: b.start, v };
  });
}

/* ---------- interactive expenses card (Overview + Расходы screen) ---------- */
export function ExpenseExplorer({ full }) {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const recs = visibleRecords(s);
  const [mode, setMode] = useState('cats');
  const [page, setPage] = useState(0);
  const [selTop, setSelTop] = useState(null);
  const [selSub, setSelSub] = useState(null);
  const top = expenseParts(recs, range, mode);
  const drill = mode === 'cats' && selTop ? expenseParts(recs, range, 'cats', selTop) : null;
  const levels = drill ? 2 : 1;
  const pg = Math.min(page, levels - 1);

  // what the bars and the "show records" button refer to
  const focus = pg === 1 && selSub ? { kind: 'cat', id: selSub } : selTop ? { kind: mode === 'cats' ? 'group' : 'label', id: selTop } : null;
  const share = (r) => {
    if (!focus) return r.amount;
    if (focus.kind === 'label') return (r.owner === focus.id || (r.labels || []).includes(focus.id)) ? r.amount : 0;
    return splitByItems(r).reduce((a, [cid, v]) => a + ((focus.kind === 'cat' ? cid === focus.id : category(cid).group === focus.id) ? v : 0), 0);
  };
  const days = dailyExpense(recs, range, share);
  const color = focus ? ((pg === 1 ? drill.parts : top.parts).find((p) => p.key === (pg === 1 ? selSub : selTop))?.color || 'var(--accent)') : 'var(--accent)';
  const ids = focus ? [...((pg === 1 && selSub ? drill.recIds[selSub] : top.recIds[selTop]) || [])] : recs.filter((r) => r.type === 'expense' && inRange(r, range)).map((r) => r.id);
  const showRecords = () => nav.push(Records, { title: focus ? (pg === 1 && selSub ? category(selSub).name : top.parts.find((p) => p.key === selTop)?.name) : 'Расходы', ids, back: 'Расходы' });

  const open = (key) => { if (mode === 'cats') { setSelTop(key); setSelSub(null); setPage(1); } };
  return (
    <>
      <Segmented options={[['cats', 'Категории'], ['labels', 'Метки и люди']]} value={mode} onChange={(m) => { setMode(m); setSelTop(null); setSelSub(null); setPage(0); }} />
      <div class="caption" style={{ margin: 'var(--s4) 0 var(--s2)' }}>{range.label}</div>
      <Pager page={pg} count={levels} onChange={setPage}>
        {pg === 0
          ? <PieDonut parts={top.parts} selected={selTop} onSelect={(k) => { setSelTop(k); setSelSub(null); }} onOpen={open} />
          : <PieDonut parts={drill.parts} selected={selSub} onSelect={setSelSub} totalLabel={group(selTop)?.name} />}
      </Pager>
      <div class="muted" style={{ textAlign: 'center', fontSize: 'var(--fs-xs)', marginTop: 4 }}>
        {pg === 0 ? (mode === 'cats' ? 'Нажмите на часть круга, ещё раз — подкатегории' : 'Нажмите на часть круга') : 'Смахните вправо, чтобы вернуться'}
      </div>
      {full && <DayBars days={days.map((d) => ({ date: d.date, values: [{ v: d.v, color }] }))} legend={[[color, 'Расходы']]} />}
      {full && <button class="ghost-btn" style={{ marginTop: 'var(--s3)' }} onClick={showRecords}>Показать {ids.length} {ids.length % 10 === 1 && ids.length % 100 !== 11 ? 'запись' : ids.length % 10 >= 2 && ids.length % 10 <= 4 && (ids.length % 100 < 12 || ids.length % 100 > 14) ? 'записи' : 'записей'}</button>}
    </>
  );
}

/** [[nature, catId, amount], ...] for one expense: receipt items count by their own category. */
const natureParts = (r) => splitByItems(r).map(([cid, v]) => [r.nature || natureOf(cid) || 'need', cid, v]);

function NatureSection() {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const [sel, setSel] = useState('all');
  const recs = visibleRecords(s).filter((r) => r.type === 'expense' && inRange(r, range));
  const pass = (n) => sel === 'all' || n === sel;
  let total = 0;
  const byNature = { must: 0, need: 0, want: 0 };
  const byCat = {};
  const ids = new Set();
  for (const r of recs) for (const [n, cid, v] of natureParts(r)) {
    byNature[n] += v;
    if (!pass(n)) continue;
    total += v; byCat[cid] = (byCat[cid] || 0) + v; ids.add(r.id);
  }
  const end = new Date(Math.min(range.to, Date.now()));
  const days = dayBuckets(range.from, end).map((b) => {
    const vals = { must: 0, need: 0, want: 0 };
    for (const r of recs) if (inRange(r, { from: b.start, to: b.end })) for (const [n, , v] of natureParts(r)) vals[n] += v;
    return { date: b.start, values: NATURES.filter(([k]) => pass(k)).map(([k, , c]) => ({ v: vals[k], color: c })) };
  });
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = top[0]?.[1] || 1;
  const all = byNature.must + byNature.need + byNature.want || 1;
  return (
    <Section title="Характер расходов" sub="Сколько я должен заплатить, сколько нужно, а сколько просто хочу?">
      <Segmented options={[['all', 'Все'], ...NATURES.map(([k, n]) => [k, n])]} value={sel} onChange={setSel} />
      <div class="caption" style={{ marginTop: 'var(--s4)' }}>{range.label}</div>
      <div class="big-amount num">{rub(total)}</div>
      {sel === 'all' && (
        <>
          <div class="cur-bar">{NATURES.map(([k, , c]) => byNature[k] > 0 && <div key={k} style={{ flex: byNature[k] / all, background: c }} />)}</div>
          <div class="chart-legend" style={{ paddingLeft: 0, margin: '8px 0 var(--s3)' }}>
            {NATURES.map(([k, n, c]) => <span key={k}><i style={{ background: c }} />{n} · {rub(byNature[k])} · {Math.round((byNature[k] / all) * 100)}%</span>)}
          </div>
        </>
      )}
      <DayBars days={days} legend={NATURES.filter(([k]) => pass(k)).map(([, n, c]) => [c, n])} />
      <div class="caption" style={{ margin: 'var(--s4) 0 var(--s2)' }}>По категориям</div>
      {top.length === 0 && <div class="muted">Нет трат за период</div>}
      {top.map(([cid, v]) => (
        <button key={cid} class="bar-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav.push(Records, { title: category(cid).name, categoryIds: [cid], range, back: 'Расходы' })}>
          <div class="bar-label"><span>{category(cid).name}</span><span class="num">{rub(v)}</span></div>
          <div class="bar"><div style={{ width: `${(v / max) * 100}%`, background: sel === 'all' ? NATURE_COLOR[natureOf(cid)] : NATURE_COLOR[sel] }} /></div>
        </button>
      ))}
      {ids.size > 0 && <button class="ghost-btn" style={{ marginTop: 'var(--s3)' }} onClick={() => nav.push(Records, { title: sel === 'all' ? 'Расходы' : NATURE_NAME[sel], ids: [...ids], back: 'Расходы' })}>Показать записи ({ids.size})</button>}
    </Section>
  );
}

export function ExpensesScreen() {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const recs = visibleRecords(s);
  const by = {};
  for (const r of recs) if (r.type === 'expense' && inRange(r, range)) for (const [cid, v] of splitByItems(r)) by[cid] = (by[cid] || 0) + v;
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = top[0]?.[1] || 1;
  return (
    <Screen pushed title="Расходы" back="Назад" onBack={nav.pop}>
      <Section title="Категории и метки" sub="Куда уходят мои деньги?"><ExpenseExplorer full /></Section>
      <NatureSection />
      <Section title="По категориям" sub="На что больше всего">
        {top.length === 0 && <div class="muted">Расходов за период нет</div>}
        {top.map(([cid, v]) => (
          <button key={cid} class="bar-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav.push(Records, { title: category(cid).name, categoryIds: [cid], range, back: 'Расходы' })}>
            <div class="bar-label"><span>{category(cid).name}</span><span class="num">{rub(v)}</span></div>
            <div class="bar"><div style={{ width: `${(v / max) * 100}%`, background: category(cid).color }} /></div>
          </button>
        ))}
      </Section>
      <div style={{ height: 130 }} />
      <PeriodDock bottom="0px" />
    </Screen>
  );
}

/* ---------- Баланс ---------- */
function balanceOver(accounts, records, from, to) {
  return dayBuckets(from, to).map((b) => ({ date: b.start, value: accounts.reduce((a, acc) => a + toRub(accountBalance(acc, records, b.end), acc.currency), 0) }));
}

export function BalanceScreen() {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const accounts = visibleAccounts(s);
  const all = alive(s.ledger.records);
  const end = new Date(Math.min(range.to, Date.now()));
  const series = balanceOver(accounts, all, range.from, end);
  const now = series[series.length - 1]?.value || 0;
  const start = series[0]?.value || 0;
  // accounts grouped by folder, in rubles
  const bal = (a) => toRub(accountBalance(a, all), a.currency);
  const rows = [];
  const seen = {};
  for (const a of sortAccounts(accounts)) {
    if (a.group) { if (seen[a.group] == null) { seen[a.group] = rows.length; rows.push({ name: a.group, value: 0, color: a.color }); } rows[seen[a.group]].value += bal(a); }
    else rows.push({ name: accLabel(a).replace(` · ${s.settings.me}`, ''), value: bal(a), color: a.color });
  }
  rows.sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const cur = {};
  for (const a of accounts) cur[a.currency || 'RUB'] = (cur[a.currency || 'RUB'] || 0) + accountBalance(a, all);
  const curTotal = Object.entries(cur).reduce((x, [c, v]) => x + toRub(v, c), 0) || 1;
  const CUR_COLOR = { RUB: 'var(--cat-teal)', USD: 'var(--pos)', EUR: 'var(--accent)' };
  return (
    <Screen pushed title="Баланс" back="Назад" onBack={nav.pop}>
      <Section title="Динамика баланса" sub="Стало ли у меня больше денег, чем раньше?"
        right={<div style={{ width: 90 }}><Delta pct={change(now, start)} goodWhenUp /></div>}>
        <div class="caption">Сегодня</div>
        <div class="big-amount num">{rub(now)}</div>
        <Lines series={[{ name: 'Баланс', color: 'var(--accent)', points: series, fill: true }]} />
      </Section>
      <Section title="Счета" sub="На каких счетах больше всего денег?">
        {rows.map((r) => (
          <div class="bar-row" key={r.name}>
            <div class="bar-label"><span>{r.name}</span><span class="num">{rub(r.value)}</span></div>
            <div class="bar"><div style={{ width: `${Math.max(0, (r.value / max) * 100)}%`, background: r.color }} /></div>
          </div>
        ))}
      </Section>
      <Section title="Валюты" sub="Сколько у меня в иностранных валютах?">
        <div class="cur-bar">{Object.entries(cur).filter(([, v]) => v > 0).map(([c, v]) => <div key={c} style={{ flex: toRub(v, c) / curTotal, background: CUR_COLOR[c] }} />)}</div>
        {Object.entries(cur).map(([c, v]) => (
          <div key={c} class="bar-label" style={{ marginTop: 10 }}><span><i class="dot" style={{ background: CUR_COLOR[c], display: 'inline-block', marginRight: 8 }} />{c}</span><span class="num">{fmt(v, c)}{c !== 'RUB' ? ` ≈ ${rub(toRub(v, c))}` : ''}</span></div>
        ))}
      </Section>
      <div style={{ height: 130 }} />
      <PeriodDock bottom="0px" />
    </Screen>
  );
}

/* ---------- Денежный поток ---------- */
function cumulative(recs, from, to, kind) {
  let acc = 0;
  return dayBuckets(from, to).map((b) => {
    for (const r of recs) {
      if (!inRange(r, { from: b.start, to: b.end })) continue;
      if (r.type === 'income' && kind !== 'expense') acc += r.amount;
      if (r.type === 'expense' && kind !== 'income') acc += kind === 'flow' ? -r.amount : r.amount;
    }
    return { date: b.start, value: acc };
  });
}

export function CashFlowScreen() {
  const s = useStore();
  const nav = useNav();
  const [, , range] = usePeriod();
  const [trend, setTrend] = useState('trend');
  const [cmp, setCmp] = useState('flow');
  const recs = visibleRecords(s);
  const t = totals(recs, range);
  const p = totals(recs, range.prev);
  const max = Math.max(t.income, t.expense, 1);
  const end = new Date(Math.min(range.to, Date.now()));
  const daily = dayBuckets(range.from, end).map((b) => {
    const tt = totals(recs, { from: b.start, to: b.end });
    return { date: b.start, values: [{ v: tt.income, color: 'var(--pos)' }, { v: tt.expense, color: 'var(--neg)' }] };
  });
  const len = range.to - range.from;
  const yearAgo = { from: addMonths(range.from, -12), to: new Date(addMonths(range.from, -12).getTime() + len) };
  const cmpSeries = [
    { name: 'Этот период', color: 'var(--accent)', points: cumulative(recs, range.from, end, cmp), fill: true },
    { name: 'Прошлый период', color: 'var(--neg)', points: cumulative(recs, range.prev.from, range.prev.to, cmp) },
    { name: 'Год назад', color: 'var(--warn)', points: cumulative(recs, yearAgo.from, yearAgo.to, cmp) },
  ];
  return (
    <Screen pushed title="Денежный поток" back="Назад" onBack={nav.pop}>
      <Section title="Денежный поток" sub="Трачу ли я меньше, чем зарабатываю?" right={<div style={{ width: 90 }}><Delta pct={change(t.flow, p.flow)} goodWhenUp /></div>}>
        <div class="caption">{range.label}</div>
        <div class="big-amount num">{rub(t.flow)}</div>
        <div class="bar-row"><div class="bar-label"><span>Доход</span><span class="num">{rub(t.income)}</span></div><div class="bar"><div style={{ width: `${(t.income / max) * 100}%`, background: 'var(--pos)' }} /></div></div>
        <div class="bar-row"><div class="bar-label"><span>Расходы</span><span class="num">{rub(t.expense)}</span></div><div class="bar"><div style={{ width: `${(t.expense / max) * 100}%`, background: 'var(--neg)' }} /></div></div>
      </Section>
      <Section title="Тенденция" sub="В какие дни я больше или меньше откладывал?">
        <Segmented options={[['trend', 'По дням'], ['cum', 'Накопительно']]} value={trend} onChange={setTrend} />
        <div style={{ marginTop: 'var(--s3)' }}>
          {trend === 'trend'
            ? <DayBars days={daily} legend={[['var(--pos)', 'Доход'], ['var(--neg)', 'Расходы']]} />
            : <Lines series={[{ name: 'Денежный поток', color: 'var(--accent)', points: cumulative(recs, range.from, end, 'flow'), fill: true }]} />}
        </div>
      </Section>
      <Section title="Сравнение с прошлым" sub="Как этот период выглядит рядом с прошлым и с тем же периодом год назад?">
        <Segmented options={[['flow', 'Поток'], ['expense', 'Расходы'], ['income', 'Доход']]} value={cmp} onChange={setCmp} />
        <div style={{ marginTop: 'var(--s3)' }}><Lines series={cmpSeries} /></div>
      </Section>
      <div style={{ height: 130 }} />
      <PeriodDock bottom="0px" />
    </Screen>
  );
}

export { dayStart, addDays, CURRENCIES, accountSections, Card };
