import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, Segmented, CatIcon } from './kit.jsx';
import { useStore, upsert, getState } from '../data/store.js';
import { ALL_GROUPS, BASE_CATEGORY_IDS, NATURES, NATURE_NAME, NATURE_COLOR } from '../data/categories.js';
const NEXT = { must: 'need', need: 'want', want: 'must' };
import { uid } from '../data/format.js';

const PALETTE = ['var(--cat-red)', 'var(--cat-sky)', 'var(--cat-orange)', 'var(--cat-violet)', 'var(--cat-lime)', 'var(--cat-indigo)', 'var(--cat-teal)', 'var(--cat-pink)', 'var(--cat-gold)', 'var(--cat-brown)'];

/** Saves one edit (rename / hide / new) into the shared ledger; it syncs to the other phone. */
function edit(id, kind, patch) {
  const prev = (getState().ledger.categories || []).find((x) => x.id === id && !x.deleted) || {};
  upsert('categories', { ...prev, id, kind, ...patch });
}

const ask = (title, value = '') => {
  const v = prompt(title, value);
  return v && v.trim() ? v.trim().slice(0, 40) : null;
};

export function Categories() {
  useStore(); // re-render when categories change, here or on the other phone
  const nav = useNav();
  const [type, setType] = useState('expense');
  const [open, setOpen] = useState(null);
  const groups = ALL_GROUPS.filter((g) => g.type === type);

  const rename = (id, kind, current) => { const n = ask('Новое название', current); if (n) edit(id, kind, { name: n }); };
  const addSub = (g) => { const n = ask(`Новая подкатегория в «${g.name}»`); if (n) edit(`${g.id}.u${uid()}`, 'cat', { name: n, group: g.id, createdAt: Date.now() }); };
  const addGroup = () => {
    const n = ask(type === 'income' ? 'Название новой группы доходов' : 'Название новой группы расходов');
    if (!n) return;
    const icon = (prompt('Значок (эмодзи), можно оставить пустым', '📁') || '📁').trim().slice(0, 4);
    const id = `g${uid()}`;
    edit(id, 'group', { name: n, type, icon, color: PALETTE[ALL_GROUPS.length % PALETTE.length], createdAt: Date.now() });
    setOpen(id);
  };

  return (
    <Screen pushed title="Категории" back="Назад" onBack={nav.pop}>
      <div class="note-box">Цветная плашка у подкатегории — характер расхода (Я должен / Мне нужно / Хочу): нажмите, чтобы сменить. Переименуйте, добавьте или скройте категории. Изменения сами придут на второй телефон. Записи не теряются: при переименовании они остаются в той же категории под новым названием.</div>
      <div style={{ padding: '0 var(--s4) var(--s3)' }}>
        <Segmented options={[['expense', 'Расходы'], ['income', 'Доходы']]} value={type} onChange={(t) => { setType(t); setOpen(null); }} />
      </div>
      <div class="list">
        {groups.map((g) => (
          <div key={g.id} style={{ opacity: g.hidden ? 0.5 : 1 }}>
            <div class="row">
              <button style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, textAlign: 'left' }} aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
                <CatIcon catId={`${g.id}.0`} size={34} />
                <span style={{ flex: 1, fontWeight: 600 }}>{g.name}{g.items && <span aria-label="с позициями чека"> 🧾</span>}{g.hidden && <span class="muted"> · скрыта</span>}</span>
                <span class="muted">{g.cats.length}</span>
                <span class="chev" aria-hidden="true">{open === g.id ? '⌄' : '›'}</span>
              </button>
            </div>
            {open === g.id && (
              <div style={{ background: 'var(--sheet)' }}>
                <div style={{ display: 'flex', gap: 8, padding: 'var(--s2) var(--s4) var(--s2) 64px', flexWrap: 'wrap' }}>
                  <button class="pill-btn" onClick={() => rename(g.id, 'group', g.name)}>✎ Переименовать группу</button>
                  <button class="pill-btn" onClick={() => edit(g.id, 'group', { hidden: !g.hidden })}>{g.hidden ? 'Показать группу' : 'Скрыть группу'}</button>
                  <button class="pill-btn" aria-pressed={g.items} onClick={() => edit(g.id, 'group', { items: !g.items })}>🧾 Позиции чека: {g.items ? 'вкл' : 'выкл'}</button>
                </div>
                {g.cats.map((c) => (
                  <div key={c.id} class="row" style={{ paddingLeft: 64, opacity: c.hidden ? 0.5 : 1 }}>
                    <span class="rl">{c.name}{c.id === `${g.id}.0` ? <span class="muted"> (общее)</span> : ''}{c.hidden && <span class="muted"> · скрыта</span>}</span>
                    {g.type === 'expense' && (
                      <button class="nature-chip" style={{ borderColor: NATURE_COLOR[c.nature], color: NATURE_COLOR[c.nature] }} aria-label={`Характер: ${NATURE_NAME[c.nature]}, нажмите чтобы сменить`}
                        onClick={() => edit(c.id, 'cat', { nature: NEXT[c.nature], ...(BASE_CATEGORY_IDS.has(c.id) ? {} : { group: g.id, name: c.name }) })}>{NATURE_NAME[c.nature]}</button>
                    )}
                    <button class="link" aria-label={`Переименовать «${c.name}»`} onClick={() => rename(c.id, 'cat', c.name)}>✎</button>
                    {c.id !== `${g.id}.0` && (
                      <button class="link" style={{ marginLeft: 12, color: 'var(--text-2)' }} onClick={() => edit(c.id, 'cat', { hidden: !c.hidden, ...(BASE_CATEGORY_IDS.has(c.id) ? {} : { group: g.id }) })}>
                        {c.hidden ? 'показать' : 'скрыть'}
                      </button>
                    )}
                  </div>
                ))}
                <button class="row" style={{ paddingLeft: 64 }} onClick={() => addSub(g)}><span class="rl accent">+ Подкатегория</span></button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: 'var(--s4)' }}><button class="btn" onClick={addGroup}>+ Новая группа {type === 'income' ? 'доходов' : 'расходов'}</button></div>
      <div class="note-box">Скрытые категории не предлагаются при добавлении записей, но старые записи в них остаются и видны в отчётах.</div>
    </Screen>
  );
}
