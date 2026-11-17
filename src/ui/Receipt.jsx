import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Sheet, Segmented, CatIcon, Empty, PERSON_COLOR } from './kit.jsx';
import { useStore, alive, upsert, PEOPLE } from '../data/store.js';
import { category } from '../data/categories.js';
import { rub, dayLabel } from '../data/format.js';
import { recognizeReceipt, receiptImage } from '../ai/receipt.js';
import { CategoryPicker, defaultAccount } from './RecordForm.jsx';
import { AccountOptions, accLabel } from './Accounts.jsx';
import { Settings } from './Settings.jsx';

const close = (a, b) => Math.abs(a - b) <= Math.max(1, 0.005 * Math.max(a, b));

/** Receipt photo / Ozon order screenshot -> items. Attaches to the bank record of that purchase when there is one. */
export function Receipt({ onSwitch }) {
  const s = useStore();
  const nav = useNav();
  const accounts = alive(s.ledger.accounts);
  const [files, setFiles] = useState([]);
  const [stage, setStage] = useState('pick'); // pick | busy | review
  const [error, setError] = useState('');
  const [r, setR] = useState(null); // recognised receipt
  const [accountId, setAccountId] = useState(() => defaultAccount(accounts, s.settings));
  const [owner, setOwner] = useState(s.settings.me);
  const [target, setTarget] = useState(null); // existing record id or 'new'
  const [picking, setPicking] = useState(null);
  const token = s.settings.receiptToken;

  const matches = (rc) => {
    if (!rc) return [];
    const day = rc.date ? new Date(`${rc.date}T12:00:00`) : new Date();
    return alive(s.ledger.records)
      .filter((x) => x.type === 'expense' && !(x.items || []).length && close(x.amount, rc.total) && Math.abs(new Date(x.date) - day) / 864e5 <= 2.5)
      .sort((a, b) => Math.abs(new Date(a.date) - day) - Math.abs(new Date(b.date) - day));
  };

  const run = async () => {
    if (!token) { setError('Нужен токен GitHub с правом «Models: Read» — добавьте его в Настройках.'); return; }
    setStage('busy'); setError('');
    try {
      const images = await Promise.all(files.map(receiptImage));
      const rc = await recognizeReceipt({ token, model: s.settings.receiptModel || 'openai/gpt-4.1-mini', images });
      setR(rc);
      const m = matches(rc);
      setTarget(m[0]?.id || 'new');
      if (m[0]) setAccountId(m[0].accountId);
      setStage('review');
    } catch (e) {
      setError(e.message || 'Ошибка распознавания');
      setStage('pick');
    }
  };

  const mainCat = (items) => {
    const by = {};
    for (const it of items) if (it.categoryId) by[it.categoryId] = (by[it.categoryId] || 0) + it.sum;
    return Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0] || 'shop.0';
  };

  const save = () => {
    const items = r.items.map((it) => ({ name: it.name, qty: it.qty, sum: String(it.sum), ...(it.categoryId ? { categoryId: it.categoryId } : {}) }));
    const main = mainCat(r.items);
    // item category equal to the record's is implied
    const slim = items.map((it) => (it.categoryId === main ? { ...it, categoryId: undefined } : it)).map((it) => { if (!it.categoryId) delete it.categoryId; return it; });
    if (target && target !== 'new') {
      const rec = s.ledger.records.find((x) => x.id === target);
      upsert('records', { ...rec, items: slim, categoryId: main, payee: rec.payee || r.store || '' });
      nav.toast(`Чек прикреплён к записи на ${rub(rec.amount)}`);
    } else {
      const d = r.date ? new Date(`${r.date}T${r.time || '12:00'}`) : new Date();
      upsert('records', { type: 'expense', amount: r.total, accountId, categoryId: main, owner, date: isNaN(d) ? new Date().toISOString() : d.toISOString(),
        payee: r.store || '', note: '', labels: [], items: slim, payment: 'Карта', status: 'done', source: 'чек' });
      nav.toast(`Добавлено: ${r.store || 'чек'} · ${rub(-r.total)}`);
    }
    nav.closeSheet();
  };

  if (picking !== null) {
    return <CategoryPicker type="expense" onClose={() => setPicking(null)}
      onPick={(id) => { setR({ ...r, items: r.items.map((it, i) => (i === picking ? { ...it, categoryId: id } : it)) }); setPicking(null); }} />;
  }

  const m = matches(r);
  const sum = r ? Math.round(r.items.reduce((a, it) => a + it.sum, 0) * 100) / 100 : 0;

  return (
    <Sheet title="Чек → позиции" onClose={nav.closeSheet}
      left={stage === 'review' ? <button class="link" onClick={() => setStage('pick')}>Назад</button> : undefined}
      footer={stage === 'pick' ? <button class="btn primary" disabled={!files.length} onClick={run}>Распознать</button>
        : stage === 'review' && r.items.length ? <button class="btn green" onClick={save}>{target && target !== 'new' ? 'Прикрепить к записи' : `Добавить · ${rub(-r.total)}`}</button> : null}>
      {stage === 'pick' && (
        <>
          <div style={{ padding: '0 var(--s4) var(--s3)' }}>
            <Segmented light options={[['photo', 'Скриншот'], ['text', 'Вставить текст'], ['receipt', 'Чек / заказ']]} value="receipt" onChange={onSwitch} />
          </div>
          <div class="note-box">Фото чека или скриншот заказа (Озон, WB, доставка). Каждая позиция запишется с ценой и категорией. Если покупка уже есть из банка — чек прикрепится к ней, без дублей.</div>
          {!token && (
            <div class="error-box">Нужен бесплатный токен GitHub с правом «Models: Read». <button class="link" onClick={() => { nav.closeSheet(); nav.push(Settings, {}); }}>Открыть настройки</button></div>
          )}
          {files.length > 0 && (
            <div class="thumbs">{files.map((f, i) => (
              <div class="th" key={i}><img src={URL.createObjectURL(f)} alt={`Чек ${i + 1}`} /><button class="x" aria-label="Убрать" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>
            ))}</div>
          )}
          <div style={{ padding: 'var(--s4)' }}>
            <label class="btn" style={{ display: 'block', textAlign: 'center' }}>
              {files.length ? 'Добавить ещё фото этого чека' : 'Выбрать фото чека или скриншот'}
              <input type="file" accept="image/*" multiple class="sr-only" onChange={(e) => setFiles([...files, ...e.currentTarget.files].slice(0, 4))} />
            </label>
          </div>
          {error && <div class="error-box" role="alert">{error}</div>}
        </>
      )}
      {stage === 'busy' && <Empty icon={<div class="spinner" />} text="Читаю чек…"><span class="muted">Обычно 5–15 секунд</span></Empty>}
      {stage === 'review' && r && (
        <>
          {!r.items.length && <Empty icon="🤷" text="Позиций не нашлось"><button class="link strong" onClick={() => setStage('pick')}>Другое фото</button></Empty>}
          {r.items.length > 0 && (
            <>
              <div class="card" style={{ margin: '0 var(--s4) var(--s3)' }}>
                <div class="caption">{r.store || 'Чек'}{r.date ? ` · ${dayLabel(`${r.date}T12:00:00`)}` : ''}</div>
                <div class="big-amount num">{rub(-r.total)}</div>
                {Math.abs(sum - r.total) > 0.009 && <div class="muted">Сумма позиций {rub(sum)} — отличается от итога (скидки или нечитаемая строка)</div>}
              </div>
              <div class="group-label">Куда записать</div>
              <div class="list">
                {m.map((x) => (
                  <button key={x.id} class="row" onClick={() => setTarget(x.id)}>
                    <span class={`check${target === x.id ? ' on' : ''}`} aria-hidden="true">{target === x.id ? '✓' : ''}</span>
                    <span class="rl">К записи {dayLabel(x.date)} · {rub(-x.amount)}<span class="muted" style={{ display: 'block' }}>{accLabel(accounts.find((a) => a.id === x.accountId))} · {x.payee || category(x.categoryId).name}</span></span>
                  </button>
                ))}
                <button class="row" onClick={() => setTarget('new')}>
                  <span class={`check${target === 'new' ? ' on' : ''}`} aria-hidden="true">{target === 'new' ? '✓' : ''}</span>
                  <span class="rl">Новая запись{m.length ? ' (такой покупки ещё нет)' : ''}</span>
                </button>
                {target === 'new' && (
                  <>
                    <label class="row"><span class="rl">Счёт</span>
                      <select value={accountId} onChange={(e) => { const id = e.currentTarget.value; setAccountId(id); const o = accounts.find((a) => a.id === id)?.owner; if (o) setOwner(o); }}><AccountOptions accounts={accounts} me={s.settings.me} /></select>
                    </label>
                    <div class="row"><span class="rl">Чья</span><div class="who">{PEOPLE.map((p) => <button key={p} class={owner === p ? 'on' : ''} onClick={() => setOwner(p)}><span style={{ color: PERSON_COLOR[p] }}>●</span> {p}</button>)}</div></div>
                  </>
                )}
              </div>
              <div class="group-label">Позиции · {r.items.length}</div>
              <div class="list">
                {r.items.map((it, i) => (
                  <div key={i} class="scan-item">
                    <button onClick={() => setPicking(i)} aria-label="Сменить категорию"><CatIcon catId={it.categoryId || 'shop.0'} size={34} /></button>
                    <div class="rec-main">
                      <input class="scan-name" value={it.name} aria-label="Товар" onInput={(e) => setR({ ...r, items: r.items.map((x, j) => (j === i ? { ...x, name: e.currentTarget.value } : x)) })} />
                      <button class="rec-sub" onClick={() => setPicking(i)}>{category(it.categoryId || 'shop.0').name}{it.qty !== 1 ? ` · ${it.qty} шт.` : ''}</button>
                    </div>
                    <div class="rec-side"><span class="amt num neg">{rub(-it.sum)}</span>
                      <button class="link" style={{ fontSize: 'var(--fs-s)' }} onClick={() => setR({ ...r, items: r.items.filter((_, j) => j !== i) })}>убрать</button></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
