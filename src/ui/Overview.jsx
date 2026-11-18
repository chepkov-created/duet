import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, Card, Menu, RecordRow, SwipeRow, Segmented, Empty, Svg, Sheet, PERSON_COLOR } from './kit.jsx';
import { Donut, Area, Bar } from './charts.jsx';
import { useStore, alive, visibleRecords, visibleAccounts, accountBalance, updateSettings, toRub, PEOPLE } from '../data/store.js';
import { periodRange, totals, byCategory, byOwner, balanceSeries } from '../data/periods.js';
import { GROUPS, group, category } from '../data/categories.js';
import { rub, fmt, plural } from '../data/format.js';
import { Records, deleteRecord } from './Records.jsx';
import { Reports } from './Reports.jsx';
import { Scheduled, Budgets, budgetSpent } from './Planning.jsx';
import { AccountForm, AddAccount, Accounts, AccountFolder, accountSections, accLabel, ACC_ICON } from './Accounts.jsx';
import { SyncScreen } from './Settings.jsx';
import { SyncChip } from './More.jsx';
import { QuickTemplates } from './Templates.jsx';
import { BellButton, PayRow, PaymentDetail, myScheduled } from './Payments.jsx';
import { ExpenseExplorer, ExpensesScreen, BalanceScreen, CashFlowScreen } from './Analytics.jsx';
import { FilterBar, FilterButton } from './Filter.jsx';
import { SortableStack } from './Sortable.jsx';

export function Overview() {
  const s = useStore();
  const nav = useNav();
  const accounts = alive(s.ledger.accounts);
  const all = alive(s.ledger.records);
  const recs = visibleRecords(s);
  const month = periodRange({ kind: 'cal', unit: 'month', offset: 0 });
  const t = totals(recs, month);
  const series = balanceSeries(visibleAccounts(s), all, 30);
  const totalBalance = series[series.length - 1]?.value || 0;
  // Account filter narrows the tiles too, not only the money widgets.
  const f = s.settings.filter || {};
  const shownAccounts = accounts.filter((a) => (!f.accounts?.length || f.accounts.includes(a.id)) && (!f.currencies?.length || f.currencies.includes(a.currency || 'RUB')));
  const hidden = s.settings.hiddenWidgets || [];
  const hide = (key) => { updateSettings({ hiddenWidgets: [...new Set([...hidden, key])] }); nav.toast(`Виджет «${WIDGETS[key]}» скрыт`, () => updateSettings({ hiddenWidgets: hidden })); };
  const [picker, setPicker] = useState(false);
  const menu = (key, extra = []) => <Menu items={[...extra, ['Скрыть виджет', () => hide(key)]]} />;

  return (
    <Screen
      title="Обзор"
      left={<SyncChip onClick={() => nav.push(SyncScreen, { pushed: true })} />}
      right={
        <>
          <BellButton />
          <button class="icon-btn" aria-label="Поиск по записям" style={{ color: 'var(--accent)', fontSize: 20 }} onClick={() => nav.push(Records, { title: 'Поиск', initialQuery: '', everything: true })}>🔍</button>
          <FilterButton />
          <button class="icon-btn" aria-label="Распознать скриншот" onClick={nav.scan} style={{ color: 'var(--accent)' }}><Svg.camera /></button>
        </>
      }
    >
      <div style={{ padding: '0 var(--s4)' }}><PersonSwitch /></div>
      <FilterBar />
      <SortableStack order={s.settings.widgets} onOrder={(widgets) => updateSettings({ widgets })} items={[
        { key: 'accounts', node: <div style={{ display: 'grid', gap: 'var(--s5)' }}><AccountsGrid accounts={shownAccounts} records={all} filtered={shownAccounts.length !== accounts.length} /></div> },
        !s.settings.hidePromo && { key: 'promo', node: (
          <div class="promo">
            <div class="p-ico" aria-hidden="true">📸</div>
            <div>
              <h3>Записывайте траты скриншотом</h3>
              <p>Сделайте снимок экрана с операциями в банке, загрузите его — и записи появятся сами, уже по категориям.</p>
            </div>
            <button aria-label="Скрыть подсказку" onClick={() => updateSettings({ hidePromo: true })} style={{ color: 'var(--text-2)', fontSize: 20 }}>✕</button>
            <button class="ghost-btn full" onClick={nav.scan}>Загрузить скриншот</button>
          </div>
        ) },
        { key: 'templates', node: <QuickTemplates /> },
        { key: 'cashflow', node: (
          <Card title="Денежный поток" menu={menu('cashflow', [['Открыть отчёт', () => nav.push(Reports, { pushed: true })]])} onMore={() => nav.push(CashFlowScreen, {})}>
            <div class="caption">Этот месяц</div>
            <div class="big-amount num">{rub(t.flow)}</div>
            <div class="bar-row">
              <div class="bar-label"><span>Доход</span><span class="num">{rub(t.income)}</span></div>
              <Bar value={t.income} max={Math.max(t.income, t.expense)} color="var(--pos)" />
            </div>
            <div class="bar-row">
              <div class="bar-label"><span>Расходы</span><span class="num">{rub(t.expense)}</span></div>
              <Bar value={t.expense} max={Math.max(t.income, t.expense)} color="var(--neg)" />
            </div>
          </Card>
        ) },
        { key: 'balance', node: (
          <Card title="Динамика баланса" menu={menu('balance', [['Все счета', () => nav.push(Accounts, { pushed: true })]])} onMore={() => nav.push(BalanceScreen, {})}>
            <div class="caption">Сегодня{s.settings.view !== 'all' ? ` · счета: ${s.settings.view}` : ' · все счета в рублях'}</div>
            <div class="big-amount num">{rub(totalBalance)}</div>
            <Area series={series} />
            <div class="legend"><i /> Баланс всех счетов</div>
          </Card>
        ) },
        { key: 'expenses', node: <ExpensesCard menu={menu('expenses')} /> },
        { key: 'recent', node: (
          <Card title="Последние записи" menu={menu('recent', [['Все записи', () => nav.push(Records, { pushed: true })]])} onMore={() => nav.push(Records, { pushed: true })}>
            {recs.length === 0 ? (
              <Empty icon="🧾" text="Записей пока нет"><button class="link strong" onClick={() => nav.record(null)}>Добавить первую</button></Empty>
            ) : (
              [...recs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5).map((r) => (
                <SwipeRow key={r.id} onDelete={() => deleteRecord(nav, r)}><RecordRow r={r} accounts={accounts} onClick={() => nav.record(r)} /></SwipeRow>
              ))
            )}
          </Card>
        ) },
        { key: 'top', node: <TopExpenses recs={recs} range={month} menu={menu('top')} /> },
        { key: 'budgets', node: (
          <Card title="Бюджеты" menu={menu('budgets')} onMore={() => nav.push(Budgets, { pushed: true })}>
            <BudgetsPreview budgets={alive(s.ledger.budgets)} recs={recs} />
          </Card>
        ) },
        { key: 'scheduled', node: (
          <Card title="Запланированные платежи" menu={menu('scheduled')} onMore={() => nav.push(Scheduled, { pushed: true })}>
            <ScheduledPreview />
          </Card>
        ) },
      ].filter((w) => w && !hidden.includes(w.key))} />
      <div style={{ padding: '0 var(--s4)' }}>
        <button class="acc add" style={{ minHeight: 56, flexDirection: 'row', width: '100%' }} onClick={() => setPicker(true)}>
          <span class="plus" aria-hidden="true" style={{ width: 30, height: 30, fontSize: 'var(--fs-xl)' }}>+</span>
          <span>Добавить виджет{hidden.length ? ` · скрыто ${hidden.length}` : ''}</span>
        </button>
      </div>
      <div class="muted" style={{ textAlign: 'center', fontSize: 'var(--fs-xs)', padding: 'var(--s3) var(--s4) var(--s5)' }}>Зажмите виджет и перетащите, чтобы поменять порядок. Скрыть — «•••» у виджета.</div>
      {picker && <WidgetsSheet onClose={() => setPicker(false)} />}
    </Screen>
  );
}

/** Accounts by person; accounts sharing a `group` (Подушка) collapse into one wide tile. */
function AccountsGrid({ accounts, records, filtered }) {
  const s = useStore();
  const nav = useNav();
  const view = s.settings.view;
  const bal = (a) => accountBalance(a, records);
  const rubOf = (items) => items.reduce((x, a) => x + toRub(bal(a), a.currency), 0);
  const sections = accountSections(accounts, s.settings.me).filter((sec) => view === 'all' || sec.key === view);
  return (
    <>
      {filtered && <div class="note-box" style={{ padding: 0 }}>Показаны только счета из фильтра</div>}
      {sections.length === 0 && <div class="note-box" style={{ padding: 0 }}>{filtered ? 'В фильтре нет счетов этого человека' : 'Счетов нет'}</div>}
      {sections.map((sec) => {
        // Tiles in the saved order; accounts with the same "Объединить в" become one folder tile, placed where its first card is.
        const tiles = [];
        const folders = {};
        for (const a of sec.items) {
          if (!a.group) { tiles.push({ a }); continue; }
          if (!folders[a.group]) { folders[a.group] = []; tiles.push({ folder: a.group, items: folders[a.group] }); }
          folders[a.group].push(a);
        }
        return (
          <div key={sec.key} style={{ display: 'grid', gap: 'var(--s3)' }}>
            <div class="acc-section"><span style={{ color: sec.color }}>●</span>{sec.title}<b class="num">{rub(rubOf(sec.items))}</b></div>
            <div class="acc-grid">
              {tiles.map((t) => {
                if (t.a || t.items.length === 1) {
                  const a = t.a || t.items[0]; // a "folder" with one card is just that card
                  return (
                    <button key={a.id} class="acc" onClick={() => nav.push(Records, { accountId: a.id, title: accLabel(a) })}>
                      <span class="badge-ico" style={{ background: a.color }} aria-hidden="true">{ACC_ICON[a.kind] || '💳'}</span>
                      <span class="acc-name">{a.name}</span>
                      <span class="acc-bal num">{fmt(bal(a), a.currency)}</span>
                    </button>
                  );
                }
                const items = t.items;
                const multi = new Set(items.map((a) => a.currency || 'RUB')).size > 1;
                const open = () => nav.push(AccountFolder, { group: t.folder, owner: sec.key === 'shared' ? '' : sec.key });
                if (multi) {
                  return (
                    <button key={'f' + t.folder} class="acc wide" onClick={open}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span class="badge-ico" style={{ background: items[0].color, marginBottom: 0 }} aria-hidden="true">{items[0].kind === 'savings' ? '🐷' : '🗂️'}</span>
                        <span class="acc-name" style={{ flex: 1 }}>{t.folder}</span>
                        <span class="acc-sub num">≈ {rub(rubOf(items))}</span>
                      </span>
                      <span class="pillow-lines num">{items.map((a) => <span key={a.id}>{fmt(bal(a), a.currency)}</span>)}</span>
                    </button>
                  );
                }
                return (
                  <button key={'f' + t.folder} class="acc folder" onClick={open}>
                    <span class="badge-ico" style={{ background: items[0].color }} aria-hidden="true">🗂️</span>
                    <span class="acc-name">{t.folder}</span>
                    <span class="acc-bal num">{fmt(rubOf(items), items[0].currency)}</span>
                    <span class="acc-sub">{items.length} {plural(items.length, 'карта', 'карты', 'карт')} ›</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <button class="acc add" style={{ minHeight: 56, flexDirection: 'row' }} onClick={() => nav.sheet(AddAccount, { onClose: nav.closeSheet })}>
        <span class="plus" aria-hidden="true" style={{ width: 30, height: 30, fontSize: 'var(--fs-xl)' }}>+</span>
        <span>Новый счёт</span>
      </button>
    </>
  );
}

export function PersonSwitch() {
  const s = useStore();
  const v = s.settings.view;
  return (
    <div class="who" role="group" aria-label="Чьи записи показывать">
      <button class={v === 'all' ? 'on' : ''} onClick={() => updateSettings({ view: 'all' })}>Общее</button>
      {PEOPLE.map((p) => (
        <button key={p} class={v === p ? 'on' : ''} onClick={() => updateSettings({ view: p })}>
          <span style={{ color: PERSON_COLOR[p] }}>●</span> {p}{p === s.settings.me ? ' (я)' : ''}
        </button>
      ))}
    </div>
  );
}

function ExpensesCard({ menu }) {
  const nav = useNav();
  return (
    <Card title="Расходы" menu={menu} onMore={() => nav.push(ExpensesScreen, {})}>
      <ExpenseExplorer />
    </Card>
  );
}

function TopExpenses({ recs, range, menu }) {
  const nav = useNav();
  const { cats } = byCategory(recs, range);
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const max = top[0]?.[1] || 0;
  return (
    <Card title="Крупнейшие траты" menu={menu} onMore={() => nav.push(Reports, { pushed: true })}>
      <div class="caption" style={{ marginBottom: 'var(--s3)' }}>Этот месяц</div>
      {top.length === 0 && <div class="muted">В этом месяце трат нет</div>}
      {top.map(([id, v]) => (
        <div class="bar-row" key={id}>
          <div class="bar-label"><span>{category(id).name}</span><span class="num">{rub(v)}</span></div>
          <Bar value={v} max={max} color={category(id).color} />
        </div>
      ))}
    </Card>
  );
}

function BudgetsPreview({ budgets, recs }) {
  const nav = useNav();
  if (!budgets.length) {
    return (
      <Empty icon="💰" text="Активных бюджетов нет">
        <button class="link strong" onClick={() => nav.push(Budgets, { pushed: true })}>Создать бюджет</button>
      </Empty>
    );
  }
  return budgets.slice(0, 3).map((b) => {
    const spent = budgetSpent(b, recs);
    const over = spent > b.amount;
    return (
      <div class="bar-row" key={b.id}>
        <div class="bar-label"><span>{b.name}</span><span class="num">{rub(spent, { cur: false })} / {rub(b.amount)}</span></div>
        <Bar value={spent} max={b.amount} color={over ? 'var(--neg)' : group(b.groupId)?.color || 'var(--accent)'} />
      </div>
    );
  });
}

function ScheduledPreview() {
  const s = useStore();
  const nav = useNav();
  const list = myScheduled(s).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 3);
  if (!list.length) return <Empty icon="⏰" text="Будущих платежей нет" />;
  return <div class="list" style={{ margin: '0 calc(-1 * var(--s5))', background: 'transparent' }}>{list.map((x) => <PayRow key={x.id} x={x} onClick={() => nav.push(PaymentDetail, { id: x.id })} />)}</div>;
}

const WIDGETS = {
  accounts: 'Счета', templates: 'Шаблоны', cashflow: 'Денежный поток', balance: 'Динамика баланса', expenses: 'Расходы',
  recent: 'Последние записи', top: 'Крупнейшие траты', budgets: 'Бюджеты', scheduled: 'Запланированные платежи', promo: 'Подсказка про скриншоты',
};

/** «Добавить виджет»: switch each widget of the Overview on or off (per phone). */
function WidgetsSheet({ onClose }) {
  const s = useStore();
  const hidden = s.settings.hiddenWidgets || [];
  const isOn = (k) => (k === 'promo' ? !s.settings.hidePromo : !hidden.includes(k));
  const flip = (k) => {
    if (k === 'promo') return updateSettings({ hidePromo: !s.settings.hidePromo });
    updateSettings({ hiddenWidgets: hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k] });
  };
  return (
    <Sheet short title="Виджеты" onClose={onClose} left={<span />} right={<button class="link strong" onClick={onClose}>Готово</button>}>
      <div class="note-box">Включённые виджеты показываются на «Обзоре». Новый встаёт в конец — потом его можно перетащить.</div>
      <div class="list">
        {Object.entries(WIDGETS).map(([k, name]) => (
          <button key={k} class="row" role="switch" aria-checked={isOn(k)} onClick={() => flip(k)}>
            <span class="rl">{name}</span>
            <span class={`toggle${isOn(k) ? ' on' : ''}`} aria-hidden="true" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
