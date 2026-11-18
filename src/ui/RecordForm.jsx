import { useState, useRef, useLayoutEffect } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Sheet, Segmented, Row, CatIcon, PERSON_COLOR } from './kit.jsx';
import { useStore, alive, upsert, remove, undoDelete, updateSettings, otherPerson, accountBalance, PEOPLE, CURRENCIES } from '../data/store.js';
import { fmt } from '../data/format.js';
import { accountSections, accLabel } from './Accounts.jsx';
import { TemplatePicker } from './Templates.jsx';
import { DateTimeSheet, dateTimeText } from './DatePick.jsx';
import { category, allowsItems, EXPENSE_GROUPS, INCOME_GROUPS, NATURES, natureOf } from '../data/categories.js';

/** "2400000,5" -> "2 400 000,5" (narrow no-break spaces between thousands). */
export const groupDigits = (raw) => {
  const s = String(raw || '').replace(/[^\d.,]/g, '').replace('.', ',');
  const [int, ...rest] = s.split(',');
  const g = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return rest.length ? `${g},${rest.join('').slice(0, 2)}` : g;
};

/** Amount field: groups thousands while typing, keeps the caret in place, shrinks long numbers to fit. */
export function AmountInput({ value, onChange, cls, big, placeholder, autoFocus }) {
  const shown = groupDigits(value);
  const base = big ? 64 : 40;
  const ref = useRef(null);
  const [size, setSize] = useState(base);
  // Measure with an invisible copy of the text styled exactly like the field (canvas fonts differ on iPhone).
  const probe = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current, pr = probe.current; if (!el || !pr) return;
    pr.style.fontSize = base + 'px';
    pr.textContent = (shown || placeholder || '0');
    const w = pr.getBoundingClientRect().width;
    const cs = getComputedStyle(el);
    const avail = el.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - 14; // room for the caret
    setSize(Math.max(18, Math.min(base, Math.floor((base * avail) / Math.max(1, w)))));
  }, [shown, base]);
  const onInput = (e) => {
    const el = e.currentTarget;
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret).replace(/[^\d.,]/g, '').length; // digits left of the caret
    const raw = el.value.replace(/[^\d.,]/g, '').replace('.', ',');
    onChange(raw);
    const next = groupDigits(raw);
    requestAnimationFrame(() => {
      let pos = 0, seen = 0;
      while (pos < next.length && seen < before) { if (/[\d,]/.test(next[pos])) seen++; pos++; }
      try { el.setSelectionRange(pos, pos); } catch { /* not focused */ }
    });
  };
  return (
    <>
      <span ref={probe} class={`amount-input num ${cls}`} aria-hidden="true"
        style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'pre', flex: 'none', width: 'auto', left: -9999, top: 0, pointerEvents: 'none' }} />
      <input ref={ref} class={`amount-input num ${cls}`} style={{ fontSize: size }} inputMode="decimal" placeholder={placeholder} autoFocus={autoFocus} value={shown} onInput={onInput} />
    </>
  );
}

/** Receipt breakdown: name × qty = line sum. Shown only for categories where it makes sense. */
function ItemsBlock({ items, total, onChange, onUseSum, onPickCat }) {
  const num = (t) => Number(String(t || '').replace(/\s/g, '').replace(',', '.')) || 0;
  const sum = Math.round(items.reduce((a, it) => a + num(it.sum), 0) * 100) / 100;
  const set = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const r2 = (v) => Math.round(v * 100) / 100;
  const qtyOf = (it) => num(it.qty) || 1;
  // Price per unit; older items (Ozon, receipts) only have the line total, so derive it.
  const priceOf = (it) => (it.price !== undefined ? it.price : it.sum === '' || it.sum === undefined ? '' : String(r2(num(it.sum) / qtyOf(it))).replace('.', ','));
  // The line total is always quantity × price.
  const setQty = (i, qty) => { const it = items[i]; set(i, { qty, price: priceOf(it), sum: r2((num(qty) || 1) * num(priceOf(it))) }); };
  const setPrice = (i, price) => set(i, { price, sum: r2(qtyOf(items[i]) * num(price)) });
  return (
    <div class="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span class="ri" aria-hidden="true">🧾</span><span class="rl">Позиции чека{items.length ? ` · ${items.length}` : ''}</span>
        <button class="link" onClick={() => onChange([...items, { name: '', qty: 1, price: '', sum: 0 }])}>+ позиция</button>
      </div>
      {items.length > 0 && (
        <div class="items-head" aria-hidden="true"><span style={{ flex: 3 }}>Товар</span><span style={{ flex: 1, maxWidth: 48 }}>Кол-во</span><span style={{ flex: 1.4 }}>Цена, ₽</span><span style={{ width: 56 }} /></div>
      )}
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gap: 2, paddingLeft: 42 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ flex: 3, textAlign: 'left' }} placeholder="Товар" aria-label="Товар" value={it.name} onInput={(e) => set(i, { name: e.currentTarget.value })} />
            <input style={{ flex: 1, maxWidth: 48 }} inputMode="decimal" aria-label="Количество" value={it.qty} onInput={(e) => setQty(i, e.currentTarget.value)} />
            <input style={{ flex: 1.4 }} inputMode="decimal" placeholder="за шт." aria-label="Цена за штуку" value={priceOf(it)} onInput={(e) => setPrice(i, e.currentTarget.value)} />
            <button class="item-cat" title={it.categoryId ? category(it.categoryId).name : 'Как у записи'} aria-label={`Категория позиции: ${it.categoryId ? category(it.categoryId).name : 'как у записи'}`} onClick={() => onPickCat(i)}
              style={{ background: it.categoryId ? category(it.categoryId).color : 'var(--surface-3)' }}>{it.categoryId ? category(it.categoryId).icon : '·'}</button>
            <button class="link" aria-label="Убрать позицию" style={{ color: 'var(--text-3)' }} onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </div>
          {qtyOf(it) !== 1 && num(priceOf(it)) > 0 && (
            <div class="muted" style={{ fontSize: 'var(--fs-xs)', textAlign: 'right', paddingRight: 56 }}>{String(it.qty).replace('.', ',')} × {priceOf(it)} = {r2(num(it.sum)).toLocaleString('ru-RU')} ₽</div>
          )}
        </div>
      ))}
      {items.length > 0 && Math.abs(sum - total) > 0.009 && (
        <div class="muted" style={{ paddingLeft: 42 }}>Сумма позиций {sum.toLocaleString('ru-RU')} ₽ из {total.toLocaleString('ru-RU')} ₽ <button class="link" onClick={() => onUseSum(sum)}>сделать суммой записи</button></div>
      )}
    </div>
  );
}
import { toLocalInput } from '../data/format.js';

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
export const PAY = ['Наличные', 'Карта', 'Перевод', 'СБП', 'Онлайн'];

// fields a template carries over into a record
const TEMPLATE_FIELDS = ['type', 'amount', 'toAmount', 'accountId', 'toAccountId', 'categoryId', 'owner', 'labels', 'note', 'payee', 'payment', 'nature'];
const pickTemplate = (t) => Object.fromEntries(TEMPLATE_FIELDS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));

/** template: undefined = record mode; true = new template; object = edit that template */
export function RecordForm({ record, defaults, template }) {
  const s = useStore();
  const nav = useNav();
  const accounts = alive(s.ledger.accounts);
  const isTpl = Boolean(template);
  const tplObj = template && template !== true ? template : null;
  // Lists show records converted to rubles: always edit the stored original.
  const stored = record ? s.ledger.records.find((x) => x.id === record.id) || record : null;
  const base = tplObj || stored;
  const numText = (n) => (n || n === 0 ? String(n).replace('.', ',') : '');
  const myDefault = defaultAccount(accounts, s.settings);
  // From a receipt: its goods (and date, shop, receipt id) come in `defaults`, also when added to an existing record.
  const fromReceipt = defaults?.items ? { items: defaults.items, ...(defaults.receipt ? { receipt: defaults.receipt } : {}) } : {};
  const [f, setF] = useState(() => base ? { name: '', ...base, ...fromReceipt, amountText: base.amount ? numText(base.amount) : '', toAmountText: numText(base.toAmount) } : {
    type: 'expense', amountText: '', toAmountText: '', accountId: myDefault, toAccountId: accounts.find((a) => a.id !== myDefault)?.id,
    categoryId: '', date: new Date().toISOString(), owner: s.settings.me, labels: [], note: '', payee: '',
    payment: 'Карта', status: 'done', name: '', ...(defaults ? pickTemplate(defaults) : {}),
    ...(defaults?.date && new Date(defaults.date) <= new Date() ? { date: defaults.date } : {}),
    ...fromReceipt,
    amountText: defaults?.amount ? numText(defaults.amount) : '',
  });
  const [picker, setPicker] = useState(null); // 'cat' | 'acc' | 'to'
  const [error, setError] = useState('');
  const upd = (patch) => setF((x) => ({ ...x, ...patch }));
  const num = (t) => Number(String(t || '').replace(/\s/g, '').replace(',', '.')) || 0;
  const amount = num(f.amountText);
  const acc = (id) => accounts.find((a) => a.id === id);
  const fromCur = acc(f.accountId)?.currency || 'RUB';
  const toCur = acc(f.toAccountId)?.currency || 'RUB';
  const exchange = f.type === 'transfer' && fromCur !== toCur;
  // Picking someone's card makes the record theirs; shared accounts keep the current person.
  const pickAccount = (id) => { const a = acc(id); upd({ accountId: id, ...(a?.owner ? { owner: a.owner } : {}) }); };

  const toTemplate = (name) => ({ ...pickTemplate({ ...f, amount, toAmount: exchange ? num(f.toAmountText) : undefined }), name, labels: f.labels || [], categoryId: f.type === 'transfer' ? '' : f.categoryId });
  const saveTemplate = () => {
    const name = f.name.trim() || f.payee?.trim() || (f.categoryId ? category(f.categoryId).name : '');
    if (!name) return setError('Дайте шаблону название или выберите категорию');
    if (f.type !== 'transfer' && !f.categoryId) return setError('Выберите категорию');
    upsert('templates', { ...(tplObj || {}), ...toTemplate(name) });
    nav.closeSheet();
  };
  const saveAsTemplate = () => {
    if (f.type !== 'transfer' && !f.categoryId) return setError('Сначала выберите категорию');
    const name = prompt('Название шаблона', f.payee || (f.categoryId ? category(f.categoryId).name : ''));
    if (!name?.trim()) return;
    upsert('templates', toTemplate(name.trim()));
    nav.toast(`Шаблон «${name.trim()}» сохранён`);
  };
  const save = () => {
    if (isTpl) return saveTemplate();
    if (isAdjust) {
      if (!f.accountId) return setError('Выберите счёт');
      if (String(f.amountText).trim() === '') return setError('Введите, сколько на счёте на самом деле');
      if (!adjDiff) return setError('Баланс уже такой — менять нечего');
      upsert('records', {
        type: adjDiff > 0 ? 'income' : 'expense', amount: Math.abs(adjDiff), accountId: f.accountId, categoryId: 'adj.0',
        date: new Date().toISOString(), owner: f.owner, labels: [], note: f.note?.trim() || 'Изменение баланса счёта', payee: '', status: 'done', payment: '',
      });
      nav.toast(`Баланс «${acc(f.accountId).name}» исправлен: ${fmt(adjDiff, fromCur, { sign: true })}`);
      return nav.closeSheet();
    }
    if (!amount) return setError('Введите сумму');
    if (f.type !== 'transfer' && !f.categoryId) return setError('Выберите категорию');
    if (!f.accountId) return setError('Выберите счёт');
    if (f.date && new Date(f.date) > endOfToday()) return setError('Записать можно только сегодняшним днём или раньше');
    if (f.type === 'transfer' && f.toAccountId === f.accountId) return setError('Выберите разные счета');
    if (exchange && !num(f.toAmountText)) return setError(`Сколько ${CURRENCIES[toCur]} пришло на «${acc(f.toAccountId).name}»?`);
    const { amountText, toAmountText, name, uses, toAmount, ...rest } = f;
    if (!rest.nature || rest.type !== 'expense') delete rest.nature;
    upsert('records', { ...rest, amount, ...(exchange ? { toAmount: num(toAmountText) } : {}), categoryId: f.type === 'transfer' ? '' : f.categoryId });
    if (!record) updateSettings({ lastAccount: f.accountId });
    nav.closeSheet();
  };
  const del = () => {
    if (tplObj) { if (confirm('Удалить шаблон?')) { remove('templates', tplObj.id); nav.closeSheet(); } return; }
    if (confirm('Удалить запись?')) { remove('records', record.id); nav.closeSheet(); nav.toast('Запись удалена', () => undoDelete()); }
  };

  const c = f.categoryId ? category(f.categoryId) : null;
  // «Баланс»: type what is really on the account, the difference becomes «Изменение баланса счёта» (not counted as spending or income).
  const isAdjust = f.type === 'adjust';
  const adjCurrent = isAdjust && f.accountId ? accountBalance(acc(f.accountId), alive(s.ledger.records)) : 0;
  const adjDiff = isAdjust && String(f.amountText).trim() !== '' ? Math.round((amount - adjCurrent) * 100) / 100 : 0;

  if (picker === 'tpl') {
    return <TemplatePicker onClose={() => setPicker(null)} onFill={(t) => {
      setF((x) => ({ ...x, ...pickTemplate(t), amountText: t.amount ? String(t.amount).replace('.', ',') : '', template: t.id }));
      setPicker(null);
    }} />;
  }
  if (typeof picker === 'number') {
    const i = picker;
    return <CategoryPicker type="expense" onClose={() => setPicker(null)}
      onPick={(id) => { upd({ items: (f.items || []).map((it, j) => (j === i ? { ...it, categoryId: id === f.categoryId ? undefined : id } : it)) }); setPicker(null); }} />;
  }
  if (picker === 'date') {
    return <DateTimeSheet value={f.date} onClose={() => setPicker(null)} onDone={(date) => { upd({ date }); setError(''); setPicker(null); }} />;
  }
  if (picker === 'cat') {
    return <CategoryPicker type={f.type} onPick={(id) => { upd({ categoryId: id }); setPicker(null); }} onClose={() => setPicker(null)} />;
  }
  if (picker === 'acc' || picker === 'to') {
    return (
      <Sheet title="Счёт" onClose={() => setPicker(null)} left={<button class="link" onClick={() => setPicker(null)}>Назад</button>}>
        {accountSections(accounts, s.settings.me).map((sec) => (
          <div key={sec.key}>
            <div class="group-label"><span style={{ color: sec.color }}>●</span> {sec.title}</div>
            <div class="list option-list">
              {sec.items.map((a) => (
                <Row key={a.id} icon={<span class="dot" style={{ background: a.color, width: 18, height: 18 }} />} label={a.name} chevron={false}
                  value={(picker === 'acc' ? f.accountId : f.toAccountId) === a.id ? '✓' : a.currency !== 'RUB' ? CURRENCIES[a.currency] : ''}
                  onClick={() => { picker === 'acc' ? pickAccount(a.id) : upd({ toAccountId: a.id }); setPicker(null); }} />
              ))}
            </div>
          </div>
        ))}
      </Sheet>
    );
  }

  return (
    <Sheet
      title={isTpl ? (tplObj ? 'Шаблон' : 'Новый шаблон') : record ? 'Запись' : 'Новая запись'}
      onClose={nav.closeSheet}
      right={!record && !isTpl && <button class="link" onClick={() => setPicker('tpl')}>Шаблоны</button>}
      footer={
        <div style={{ display: 'grid', gap: 8 }}>
          <button class="btn primary" onClick={save}>{isTpl ? 'Сохранить шаблон' : 'Сохранить'}</button>
          {!isTpl && f.type !== 'adjust' && <button class="link" style={{ padding: 6 }} onClick={saveAsTemplate}>Сохранить как шаблон</button>}
        </div>
      }
    >
      {isTpl && (
        <div class="list" style={{ marginBottom: 'var(--s3)' }}>
          <label class="row"><span class="ri" aria-hidden="true">⚡</span><span class="rl">Название</span>
            <input value={f.name} placeholder="Например, Кофе" onInput={(e) => upd({ name: e.currentTarget.value })} maxLength={40} autoFocus={!tplObj} />
          </label>
        </div>
      )}
      {!record && !isTpl && (
        <div style={{ padding: '0 var(--s4) var(--s3)', display: 'flex', gap: 8 }}>
          <button class="pill-btn" onClick={nav.scan}>📸 Из скриншота</button>
          <button class="pill-btn" onClick={() => setPicker('tpl')}>⚡ Из шаблона</button>
        </div>
      )}
      <div style={{ padding: '0 var(--s4) var(--s3)' }}>
        <Segmented light options={[['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод'], ...(!record && !isTpl ? [['adjust', 'Баланс']] : [])]} value={f.type}
          onChange={(type) => upd({ type, categoryId: c && c.type === (type === 'income' ? 'income' : 'expense') ? f.categoryId : '' })} />
      </div>
      {isAdjust && (
        <div class="note-box">Пересчитали деньги и не сходится? Введите, сколько на счёте <b>на самом деле</b>. Разница запишется как «Изменение баланса счёта» и не попадёт ни в траты, ни в доходы.</div>
      )}
      <label class="amount-box">
        <span class="cur">{fromCur}</span>
        <span class="sr-only">{isAdjust ? 'Сколько на счёте на самом деле' : 'Сумма'}</span>
        {isAdjust ? (
          <AmountInput cls="transfer" big placeholder={String(Math.round(adjCurrent * 100) / 100).replace('.', ',')} autoFocus
            value={f.amountText} onChange={(v) => { upd({ amountText: v }); setError(''); }} />
        ) : <AmountInput cls={f.type} big placeholder={isTpl ? 'любая' : f.type === 'expense' ? '-0' : '0'} autoFocus={!record && !isTpl}
          value={f.amountText} onChange={(v) => { upd({ amountText: v }); setError(''); }} />}
      </label>
      {isAdjust && f.accountId && (
        <div class="note-box">В приложении сейчас: <b class="num">{fmt(adjCurrent, fromCur)}</b>
          {adjDiff !== 0 && <> · будет записано <b class="num" style={{ color: adjDiff > 0 ? 'var(--pos-text)' : 'var(--neg-text)' }}>{fmt(adjDiff, fromCur, { sign: true })}</b></>}
        </div>
      )}
      {exchange && (
        <label class="amount-box" style={{ borderTop: '1px solid var(--line)' }}>
          <span class="cur">{toCur}</span>
          <span class="muted">пришло</span>
          <AmountInput cls="transfer" placeholder="0" value={f.toAmountText} onChange={(v) => { upd({ toAmountText: v }); setError(''); }} />
        </label>
      )}
      {exchange && amount > 0 && num(f.toAmountText) > 0 && (
        <div class="note-box">Курс обмена: 1 {CURRENCIES[fromCur === 'RUB' ? toCur : fromCur]} = {(fromCur === 'RUB' ? amount / num(f.toAmountText) : num(f.toAmountText) / amount).toFixed(2).replace('.', ',')} {CURRENCIES[fromCur === 'RUB' ? fromCur : toCur]}</div>
      )}
      {error && <div class="error-box" role="alert">{error}</div>}

      <div class="group-label">Основное</div>
      <div class="list">
        <Row icon={<span class="dot" style={{ background: acc(f.accountId)?.color, width: 20, height: 20 }} />} label={f.type === 'transfer' ? 'Со счёта' : 'Счёт'} value={f.accountId ? accLabel(acc(f.accountId)) : 'Выбрать'} onClick={() => setPicker('acc')} />
        {isAdjust ? null : f.type === 'transfer' ? (
          <Row icon="⇄" label="На счёт" value={f.toAccountId ? accLabel(acc(f.toAccountId)) : 'Выбрать'} onClick={() => setPicker('to')} />
        ) : (
          <Row icon={c ? <CatIcon catId={c.id} size={30} /> : <span class="cat-ico" style={{ background: 'var(--surface-2)', width: 30, height: 30, fontSize: 16 }}>?</span>}
            label="Категория" value={c ? c.name : 'Обязательно'} valueClass={c ? '' : 'req'} onClick={() => setPicker('cat')} />
        )}
        {!isTpl && !isAdjust && (
          <Row icon="📅" label="Дата и время" value={dateTimeText(f.date || new Date().toISOString())} onClick={() => setPicker('date')} />
        )}
        <div class="row"><span class="ri" aria-hidden="true">👤</span><span class="rl">Чья запись</span>
          <div class="who">
            {PEOPLE.map((p) => (
              <button key={p} class={f.owner === p ? 'on' : ''} onClick={() => upd({ owner: p })}><span style={{ color: PERSON_COLOR[p] }}>●</span> {p}</button>
            ))}
          </div>
        </div>
      </div>

      {isAdjust && (
        <div class="list" style={{ marginTop: 'var(--s5)' }}>
          <label class="row"><span class="ri" aria-hidden="true">✍️</span><span class="rl">Заметка</span><input value={f.note} placeholder="Например, пересчитали наличные" onInput={(e) => upd({ note: e.currentTarget.value })} maxLength={140} /></label>
        </div>
      )}
      {!isAdjust && <>
      <div class="group-label">Подробнее</div>
      <div class="list">
        <label class="row"><span class="ri" aria-hidden="true">✍️</span><span class="rl">Заметка</span><input value={f.note} placeholder="Необязательно" onInput={(e) => upd({ note: e.currentTarget.value })} maxLength={140} /></label>
        <label class="row"><span class="ri" aria-hidden="true">🏪</span><span class="rl">Получатель</span><input value={f.payee} placeholder="Магазин или человек" onInput={(e) => upd({ payee: e.currentTarget.value })} maxLength={80} /></label>
        {!isTpl && (allowsItems(f.categoryId) || (f.items || []).length > 0) && (
          <ItemsBlock items={f.items || []} total={amount} onChange={(items) => upd({ items })} onUseSum={(sum) => upd({ amountText: String(sum).replace('.', ',') })} onPickCat={(i) => setPicker(i)} />
        )}
        {f.type === 'expense' && f.categoryId && (() => {
          const def = natureOf(f.categoryId);
          const cur = f.nature || def;
          return (
            <div class="row" style={{ flexWrap: 'wrap', rowGap: 8 }}>
              <span class="ri" aria-hidden="true">🎯</span>
              <span class="rl">Характер{!f.nature && <span class="muted"> · как у категории</span>}</span>
              <div class="who" style={{ marginLeft: 42, width: 'calc(100% - 42px)', display: 'flex' }}>
                {NATURES.map(([k, n, c]) => (
                  <button key={k} class={cur === k ? 'on' : ''} onClick={() => upd({ nature: k === def ? undefined : k })}><span style={{ color: c }}>●</span> {n}</button>
                ))}
              </div>
            </div>
          );
        })()}
        <LabelsRow labels={f.labels || []} onChange={(labels) => upd({ labels })} />
        {!isTpl && (
          <button class="row" role="switch" aria-checked={Boolean(f.secretFrom)} onClick={() => upd({ secretFrom: f.secretFrom ? '' : otherPerson(s) })}>
            <span class="ri" aria-hidden="true">🤫</span>
            <span class="rl">Секрет от {f.secretFrom || otherPerson(s)}
              <span class="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>Для сюрпризов: {f.secretFrom || otherPerson(s)} не увидит эту запись</span>
            </span>
            <span class={`toggle${f.secretFrom ? ' on' : ''}`} aria-hidden="true" />
          </button>
        )}
        <label class="row"><span class="ri" aria-hidden="true">💳</span><span class="rl">Способ оплаты</span>
          <select value={f.payment} onChange={(e) => upd({ payment: e.currentTarget.value })}>{PAY.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        {!isTpl && (
          <label class="row"><span class="ri" aria-hidden="true">⏳</span><span class="rl">Статус</span>
            <select value={f.status} onChange={(e) => upd({ status: e.currentTarget.value })}>
              <option value="done">Проведено</option>
              <option value="planned">Ожидается</option>
            </select>
          </label>
        )}
      </div>
      </>}
      {(record || tplObj) && <div style={{ padding: 'var(--s6) var(--s4) 0' }}><button class="btn danger" onClick={del}>{tplObj ? 'Удалить шаблон' : 'Удалить запись'}</button></div>}
    </Sheet>
  );
}

export function LabelsRow({ labels, onChange }) {
  const [text, setText] = useState('');
  const add = () => { const t = text.trim(); if (t && !labels.includes(t)) onChange([...labels, t]); setText(''); };
  return (
    <div class="row" style={{ flexWrap: 'wrap' }}>
      <span class="ri" aria-hidden="true">🏷️</span>
      <span class="rl">Метки</span>
      {labels.map((l) => <button key={l} class="label-chip on" aria-label={`Убрать метку ${l}`} onClick={() => onChange(labels.filter((x) => x !== l))}>{l} ✕</button>)}
      <input value={text} placeholder="+ метка" style={{ maxWidth: 110 }} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && add()} onBlur={add} maxLength={24} />
    </div>
  );
}

/** Last used account on this phone, else this person's first card, else anything. */
export function defaultAccount(accounts, settings) {
  if (accounts.some((a) => a.id === settings.lastAccount)) return settings.lastAccount;
  const mine = accounts.filter((a) => a.owner === settings.me);
  return (mine.find((a) => a.kind === 'bank') || mine[0] || accounts[0])?.id;
}

// Everyday words people type that aren't in the category name.
const CAT_WORDS = {
  'Продукты': 'супермаркет магазин пятерочка магнит перекресток лента ашан вкусвилл',
  'Рестораны, фастфуд': 'кафе кофе кофейня ресторан столовая обед доставка еды бургер пицца суши',
  'Напитки, бары': 'бар пиво алкоголь вино',
  'Топливо': 'бензин заправка азс дизель газ',
  'Парковка': 'стоянка',
  'Обслуживание авто': 'сто шиномонтаж мойка автомойка ремонт машины',
  'Общественный транспорт': 'метро автобус электричка проезд тройка',
  'Такси': 'яндекс go uber',
  'Коммунальные платежи': 'жку жкх квартплата свет электричество вода газ отопление',
  'Аренда': 'квартира съем',
  'Врачи, медицина': 'аптека лекарства больница клиника анализы стоматолог зубы',
  'Уход, красота': 'парикмахер стрижка маникюр барбер косметолог',
  'Спорт, фитнес': 'зал тренажерный бассейн тренировка',
  'Мобильная связь': 'телефон сотовая мтс мегафон билайн теле2',
  'Интернет': 'провайдер wifi',
  'Софт, приложения, игры': 'подписка игры приложение стриминг кино музыка',
  'Одежда и обувь': 'одежда обувь кроссовки',
  'Здоровье и красота': 'косметика аптека',
  'Для дома': 'хозтовары посуда мебель',
  'Электроника, бытовая техника': 'техника телефон ноутбук наушники',
  'Подарки': 'подарок день рождения',
  'Комиссии, сборы': 'комиссия банк обслуживание',
  'Доставка': 'курьер сдэк почта озон wb',
  'Зарплата': 'зп аванс',
};

export function CategoryPicker({ type, onPick, onClose }) {
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const groups = type === 'income' ? INCOME_GROUPS : EXPENSE_GROUPS;
  const needle = q.trim().toLowerCase().replace(/ё/g, 'е');
  const norm = (t) => t.toLowerCase().replace(/ё/g, 'е');
  // Search: every subcategory whose own name or group name contains the words typed.
  const found = needle ? groups.flatMap((g) => g.cats.filter(({ name }) => needle.split(/\s+/).every((w) => norm(`${name} ${g.name} ${CAT_WORDS[name] || ''}`).includes(w))).map((c) => ({ ...c, g }))) : [];
  return (
    <Sheet title="Категория" onClose={onClose} left={<button class="link" onClick={onClose}>Назад</button>}>
      <label class="search" style={{ marginTop: 0 }}><span aria-hidden="true">🔍</span><span class="sr-only">Поиск категории</span>
        <input type="search" placeholder="Поиск категории" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </label>
      {needle && (
        <div class="list">
          {found.length === 0 && <div class="note-box">Ничего не нашлось. Новую категорию можно создать в «Ещё → Категории».</div>}
          {found.map(({ id, name, g }) => (
            <button key={id} class="row" onClick={() => onPick(id)}>
              <CatIcon catId={id} size={32} />
              <span class="rl">{id === `${g.id}.0` ? `${name} (общее)` : name}<span class="muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>{g.name}</span></span>
            </button>
          ))}
        </div>
      )}
      {!needle && <div class="list">
        {groups.map((g) => (
          <div key={g.id}>
            <button class="cat-group-title" aria-expanded={open === g.id || groups.length === 1} onClick={() => setOpen(open === g.id ? null : g.id)}>
              <CatIcon catId={`${g.id}.0`} size={36} />
              <span style={{ flex: 1 }}>{g.name}</span>
              <span class="chev" aria-hidden="true">{open === g.id || groups.length === 1 ? '⌄' : '›'}</span>
            </button>
            {(open === g.id || groups.length === 1) && g.cats.map(({ id, name }) => (
              <button key={id} class="row" style={{ paddingLeft: 64 }} onClick={() => onPick(id)}>
                <span class="rl">{id === `${g.id}.0` ? `${name} (общее)` : name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>}
    </Sheet>
  );
}
