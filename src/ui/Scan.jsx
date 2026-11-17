import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Sheet, CatIcon, Empty, PERSON_COLOR } from './kit.jsx';
import { useStore, alive, upsertMany, PEOPLE } from '../data/store.js';
import { category } from '../data/categories.js';
import { rub, dayLabel, uid, sameDay } from '../data/format.js';
import { prepareImage, recognize } from '../ai/scan.js';
import { CategoryPicker, defaultAccount } from './RecordForm.jsx';
import { AccountOptions } from './Accounts.jsx';
import { Settings } from './Settings.jsx';

export function Scan() {
  const s = useStore();
  const nav = useNav();
  const accounts = alive(s.ledger.accounts);
  const [images, setImages] = useState([]);
  const [stage, setStage] = useState('pick'); // pick | busy | review
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState(() => defaultAccount(accounts, s.settings));
  const [owner, setOwner] = useState(s.settings.me);
  const [picking, setPicking] = useState(null); // index for category picker

  const addFiles = async (files) => {
    setError('');
    try {
      const prepared = await Promise.all([...files].filter((f) => f.type.startsWith('image/')).map(prepareImage));
      setImages((x) => [...x, ...prepared].slice(0, 6));
    } catch { setError('Не удалось открыть изображение'); }
  };

  const run = async () => {
    if (!s.settings.aiKey) { setError('Сначала добавьте ключ Anthropic в настройках.'); return; }
    setStage('busy'); setError('');
    try {
      const tx = await recognize({ key: s.settings.aiKey, model: s.settings.aiModel, images });
      const existing = alive(s.ledger.records);
      setItems(tx.map((t) => {
        const date = toIso(t.date, t.time);
        const dup = existing.some((r) => Math.abs(r.amount - t.amount) < 0.01 && r.type === t.type && sameDay(r.date, date));
        // Transfers between own accounts are not spending, so they start unchecked.
        return { ...t, key: uid(), date, on: !dup && t.type !== 'transfer', dup };
      }));
      setStage('review');
    } catch (e) {
      setError(e.message || 'Ошибка распознавания');
      setStage('pick');
    }
  };

  const save = () => {
    const chosen = items.filter((x) => x.on);
    upsertMany('records', chosen.map((t) => ({
      type: t.type === 'transfer' ? 'expense' : t.type, amount: t.amount, accountId, categoryId: t.type === 'transfer' ? 'fin.0' : t.categoryId,
      date: t.date, owner, payee: t.payee, note: t.description, labels: [], payment: 'Карта', status: 'done', source: 'скриншот',
    })));
    nav.closeSheet();
  };

  if (picking !== null) {
    const it = items[picking];
    return <CategoryPicker type={it.type === 'income' ? 'income' : 'expense'} onClose={() => setPicking(null)}
      onPick={(id) => { setItems(items.map((x, i) => (i === picking ? { ...x, categoryId: id, confidence: 'high' } : x))); setPicking(null); }} />;
  }

  const count = items.filter((x) => x.on).length;
  const sum = items.filter((x) => x.on).reduce((a, x) => a + (x.type === 'income' ? x.amount : -x.amount), 0);

  return (
    <Sheet title="Скриншот → записи" onClose={nav.closeSheet}
      footer={
        stage === 'pick' ? <button class="btn primary" disabled={!images.length} onClick={run}>Распознать</button>
          : stage === 'review' ? <button class="btn green" disabled={!count} onClick={save}>Добавить {count} {count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей'} · {rub(sum)}</button>
          : null
      }>
      {stage === 'busy' && (
        <Empty icon={<div class="spinner" />} text="Читаю операции…"><span class="muted">Обычно занимает 5–20 секунд</span></Empty>
      )}

      {stage === 'pick' && (
        <>
          <div class="note-box">Сделайте скриншот списка операций в приложении банка и выберите его здесь. Можно сразу несколько.</div>
          {images.length > 0 && (
            <div class="thumbs">
              {images.map((img, i) => (
                <div class="th" key={i}>
                  <img src={img.preview} alt={`Скриншот ${i + 1}`} />
                  <button class="x" aria-label="Убрать" onClick={() => setImages(images.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: 'var(--s4)' }}>
            <label class="btn" style={{ display: 'block', textAlign: 'center' }}>
              {images.length ? 'Добавить ещё' : 'Выбрать скриншоты'}
              <input type="file" accept="image/*" multiple class="sr-only" onChange={(e) => addFiles(e.currentTarget.files)} />
            </label>
          </div>
          {error && <div class="error-box" role="alert">{error}{!s.settings.aiKey && <> <button class="link" onClick={() => { nav.closeSheet(); nav.push(Settings, {}); }}>Открыть настройки</button></>}</div>}
        </>
      )}

      {stage === 'review' && (
        <>
          {items.length === 0 && <Empty icon="🤷" text="Операций не нашлось"><button class="link strong" onClick={() => setStage('pick')}>Попробовать другой скриншот</button></Empty>}
          {items.length > 0 && (
            <>
              <div class="list">
                <label class="row"><span class="rl">Счёт для всех</span>
                  <select value={accountId} onChange={(e) => { const id = e.currentTarget.value; setAccountId(id); const o = accounts.find((a) => a.id === id)?.owner; if (o) setOwner(o); }}><AccountOptions accounts={accounts} me={s.settings.me} /></select>
                </label>
                <div class="row"><span class="rl">Чьи траты</span>
                  <div class="who">{PEOPLE.map((p) => <button key={p} class={owner === p ? 'on' : ''} onClick={() => setOwner(p)}><span style={{ color: PERSON_COLOR[p] }}>●</span> {p}</button>)}</div>
                </div>
              </div>
              <div class="note-box">Проверьте список. Нажмите на категорию, чтобы её поменять. Похожие на уже добавленные записи сняты с галочки.</div>
              <div class="list">
                {items.map((t, i) => (
                  <div key={t.key} class={`scan-item${t.on ? '' : ' off'}`}>
                    <button class={`check${t.on ? ' on' : ''}`} role="checkbox" aria-checked={t.on} aria-label="Добавлять эту запись"
                      onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}>{t.on ? '✓' : ''}</button>
                    <button onClick={() => setPicking(i)} aria-label="Сменить категорию"><CatIcon catId={t.categoryId} size={40} /></button>
                    <div class="rec-main">
                      <div style={{ fontWeight: 500 }}>{t.payee || category(t.categoryId).name}</div>
                      <button class="rec-sub" style={{ color: t.confidence === 'low' ? 'var(--warn)' : 'var(--text-2)' }} onClick={() => setPicking(i)}>
                        {category(t.categoryId).name}{t.confidence === 'low' && <span class="tag">проверьте</span>}{t.dup && <span class="tag dup">уже есть?</span>}{t.type === 'transfer' && <span class="tag">перевод</span>}
                      </button>
                      <div class="rec-sub">{dayLabel(t.date)}{t.description ? ` · ${t.description}` : ''}</div>
                    </div>
                    <div class="rec-side">
                      <span class={`amt num ${t.type === 'income' ? 'pos' : 'neg'}`}>{rub(t.type === 'income' ? t.amount : -t.amount)}</span>
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
