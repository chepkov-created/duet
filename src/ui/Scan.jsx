import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Sheet, CatIcon, Empty, Segmented, PERSON_COLOR } from './kit.jsx';
import { useStore, alive, upsertMany, PEOPLE } from '../data/store.js';
import { category } from '../data/categories.js';
import { rub, dayLabel, uid, sameDay } from '../data/format.js';
import { readScreenshots } from '../ai/ocr.js';
import { parseBankText, categoryMemory } from '../ai/parse.js';
import { CategoryPicker, defaultAccount } from './RecordForm.jsx';
import { AccountOptions } from './Accounts.jsx';
import { Receipt } from './Receipt.jsx';

/** Screenshot or pasted text → reviewed list → records. Everything runs on the phone, for free. */
export function Scan() {
  const s = useStore();
  const nav = useNav();
  const accounts = alive(s.ledger.accounts);
  const [mode, setMode] = useState('photo'); // photo | text
  const [files, setFiles] = useState([]);
  const [text, setText] = useState('');
  const [stage, setStage] = useState('pick'); // pick | busy | review
  const [progress, setProgress] = useState('');
  const [items, setItems] = useState([]);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState(() => defaultAccount(accounts, s.settings));
  const [owner, setOwner] = useState(() => accounts.find((a) => a.id === defaultAccount(accounts, s.settings))?.owner || s.settings.me);
  const [picking, setPicking] = useState(null);

  const toItems = (raw) => {
    const existing = alive(s.ledger.records);
    const tx = parseBankText(raw, { memory: categoryMemory(existing) });
    return tx.map((t) => {
      const date = toIso(t.date, t.time);
      const dup = existing.some((r) => Math.abs(r.amount - t.amount) < 0.01 && r.type === t.type && sameDay(r.date, date));
      // Transfers between own accounts are not spending, so they start unchecked.
      return { ...t, key: uid(), date, on: !dup && t.type !== 'transfer', dup };
    });
  };

  const run = async () => {
    setError('');
    if (mode === 'text') {
      setRawText(text);
      setItems(toItems(text));
      setStage('review');
      return;
    }
    setStage('busy');
    try {
      const raw = await readScreenshots(files, ({ stage: st, p, index, total }) => {
        const n = total > 1 ? ` (${index + 1} из ${total})` : '';
        setProgress(st === 'load' ? 'Загружаю распознавание (первый раз ~15 МБ)…' : `Читаю скриншот${n}… ${Math.round(p * 100)}%`);
      });
      setRawText(raw);
      setItems(toItems(raw));
      setStage('review');
    } catch (e) {
      setError(navigator.onLine ? 'Не получилось прочитать скриншот. Попробуйте ещё раз или вставьте текст.' : 'Для первого распознавания нужен интернет: загружается словарь. Потом работает и без сети.');
      setStage('pick');
    }
  };

  const save = () => {
    const chosen = items.filter((x) => x.on);
    upsertMany('records', chosen.map((t) => ({
      type: t.type === 'transfer' ? 'expense' : t.type, amount: t.amount, accountId, categoryId: t.type === 'transfer' ? 'fin.0' : t.categoryId,
      date: t.date, owner, payee: t.payee, note: t.description, labels: [], payment: 'Карта', status: 'done', source: 'скриншот',
    })));
    nav.toast(`Добавлено записей: ${chosen.length}`);
    nav.closeSheet();
  };

  const edit = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  if (mode === 'receipt') return <Receipt onSwitch={setMode} />;
  if (picking !== null) {
    const it = items[picking];
    return <CategoryPicker type={it.type === 'income' ? 'income' : 'expense'} onClose={() => setPicking(null)}
      onPick={(id) => { edit(picking, { categoryId: id, confidence: 'high' }); setPicking(null); }} />;
  }

  const count = items.filter((x) => x.on).length;
  const sum = items.filter((x) => x.on).reduce((a, x) => a + (x.type === 'income' ? x.amount : -x.amount), 0);

  return (
    <Sheet title="Скриншот → записи" onClose={nav.closeSheet}
      left={stage === 'review' ? <button class="link" onClick={() => setStage('pick')}>Назад</button> : undefined}
      footer={
        stage === 'pick' ? <button class="btn primary" disabled={mode === 'photo' ? !files.length : !text.trim()} onClick={run}>Распознать</button>
          : stage === 'review' ? <button class="btn green" disabled={!count} onClick={save}>Добавить {count} {count === 1 ? 'запись' : count > 1 && count < 5 ? 'записи' : 'записей'} · {rub(sum)}</button>
          : null
      }>
      {stage === 'busy' && <Empty icon={<div class="spinner" />} text={progress || 'Готовлюсь…'}><span class="muted">Всё происходит на телефоне, бесплатно</span></Empty>}

      {stage === 'pick' && (
        <>
          <div style={{ padding: '0 var(--s4) var(--s3)' }}>
            <Segmented light options={[['photo', 'Скриншот'], ['text', 'Вставить текст'], ['receipt', 'Чек / заказ']]} value={mode} onChange={setMode} />
          </div>
          {mode === 'photo' ? (
            <>
              <div class="note-box">Скриншот списка операций из приложения банка. Можно несколько сразу. Распознавание идёт прямо на телефоне, бесплатно.</div>
              {files.length > 0 && (
                <div class="thumbs">
                  {files.map((f, i) => (
                    <div class="th" key={i}>
                      <img src={URL.createObjectURL(f)} alt={`Скриншот ${i + 1}`} />
                      <button class="x" aria-label="Убрать" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding: 'var(--s4)' }}>
                <label class="btn" style={{ display: 'block', textAlign: 'center' }}>
                  {files.length ? 'Добавить ещё' : 'Выбрать скриншоты'}
                  <input type="file" accept="image/*" multiple class="sr-only" onChange={(e) => setFiles([...files, ...e.currentTarget.files].slice(0, 6))} />
                </label>
              </div>
            </>
          ) : (
            <>
              <div class="note-box">Самый точный способ: откройте скриншот в «Фото», нажмите и подержите на тексте, выберите «Выбрать всё» → «Скопировать» и вставьте сюда.</div>
              <div style={{ padding: '0 var(--s4)' }}>
                <label class="sr-only" for="pasted">Текст операций</label>
                <textarea id="pasted" class="paste-box" rows={10} placeholder={'Пятёрочка\nСупермаркеты\n1 234,56 ₽\n…'} value={text} onInput={(e) => setText(e.currentTarget.value)} />
              </div>
            </>
          )}
          {error && <div class="error-box" role="alert">{error}</div>}
        </>
      )}

      {stage === 'review' && (
        <>
          {items.length === 0 && (
            <Empty icon="🤷" text="Операций не нашлось">
              <span class="muted" style={{ maxWidth: 300 }}>Попробуйте «Вставить текст» — iPhone читает текст со скриншота точнее.</span>
              <button class="link strong" onClick={() => { setMode('text'); setText(rawText); setStage('pick'); }}>Посмотреть, что прочиталось</button>
            </Empty>
          )}
          {items.length > 0 && (
            <>
              <div class="list">
                <label class="row"><span class="rl">Счёт для всех</span>
                  <select value={accountId} onChange={(e) => { const id = e.currentTarget.value; setAccountId(id); const o = accounts.find((a) => a.id === id)?.owner; if (o) setOwner(o); }}><AccountOptions accounts={accounts} me={s.settings.me} /></select>
                </label>
                <div class="row"><span class="rl">Чьи</span>
                  <div class="who">{PEOPLE.map((p) => <button key={p} class={owner === p ? 'on' : ''} onClick={() => setOwner(p)}><span style={{ color: PERSON_COLOR[p] }}>●</span> {p}</button>)}</div>
                </div>
              </div>
              <div class="note-box">Проверьте список. Иконка — сменить категорию, сумма — расход ↔ доход, ✎ — поправить сумму. Похожие на уже добавленные записи сняты с галочки.</div>
              <div class="list">
                {items.map((t, i) => (
                  <div key={t.key} class={`scan-item${t.on ? '' : ' off'}`}>
                    <button class={`check${t.on ? ' on' : ''}`} role="checkbox" aria-checked={t.on} aria-label="Добавлять эту запись" onClick={() => edit(i, { on: !t.on })}>{t.on ? '✓' : ''}</button>
                    <button onClick={() => setPicking(i)} aria-label="Сменить категорию"><CatIcon catId={t.categoryId} size={40} /></button>
                    <div class="rec-main">
                      <input class="scan-name" value={t.payee} aria-label="Название" onInput={(e) => edit(i, { payee: e.currentTarget.value })} />
                      <button class="rec-sub" style={{ color: t.confidence === 'low' ? 'var(--warn)' : 'var(--text-2)' }} onClick={() => setPicking(i)}>
                        {category(t.categoryId).name}{t.confidence === 'low' && <span class="tag">проверьте</span>}{t.dup && <span class="tag dup">уже есть?</span>}{t.type === 'transfer' && <span class="tag">перевод</span>}
                      </button>
                      <div class="rec-sub">{dayLabel(t.date)}</div>
                    </div>
                    <div class="rec-side">
                      <button class={`amt num ${t.type === 'income' ? 'pos' : 'neg'}`} aria-label="Расход или доход"
                        onClick={() => edit(i, { type: t.type === 'income' ? 'expense' : 'income', categoryId: t.type === 'income' ? 'other.0' : 'inc.0', confidence: 'low' })}>
                        {rub(t.type === 'income' ? t.amount : -t.amount)}
                      </button>
                      <button class="link" style={{ fontSize: 'var(--fs-s)' }} onClick={() => {
                        const v = prompt('Сумма', String(t.amount).replace('.', ','));
                        const n = Number(String(v || '').replace(/\s/g, '').replace(',', '.'));
                        if (n > 0) edit(i, { amount: n });
                      }}>✎ сумма</button>
                    </div>
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

function toIso(date, time) {
  const now = new Date();
  if (!date) return now.toISOString();
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '12:00').split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 12, mm || 0);
  return isNaN(dt) ? now.toISOString() : dt.toISOString();
}
