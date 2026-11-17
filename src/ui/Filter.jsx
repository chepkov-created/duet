import { useState } from 'preact/hooks';
import { Sheet, CatIcon, PERSON_COLOR } from './kit.jsx';
import { useStore, alive, updateSettings, filterCount, allLabels, EMPTY_FILTER, PEOPLE } from '../data/store.js';
import { GROUPS, category, group } from '../data/categories.js';
import { accLabel, accountSections } from './Accounts.jsx';

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FilterButton() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const n = filterCount(s.settings.filter);
  return (
    <>
      <button class="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setOpen(true)} aria-label={`Фильтр${n ? `, активно ${n}` : ''}`}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z" fill={n ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
        Фильтр{n ? <span class="count-badge">{n}</span> : null}
      </button>
      {open && <FilterSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** Chips for what is filtered now, with a reset. Renders nothing when no filter and everyone is shown. */
export function FilterBar() {
  const s = useStore();
  const f = s.settings.filter || EMPTY_FILTER;
  const [open, setOpen] = useState(false);
  if (!filterCount(f)) return null;
  const accounts = alive(s.ledger.accounts);
  const chips = [
    ...f.accounts.map((id) => ['accounts', id, accLabel(accounts.find((a) => a.id === id))]),
    ...f.cats.map((id) => ['cats', id, id.includes('.') ? category(id).name : group(id)?.name]),
    ...f.labels.map((l) => ['labels', l, `#${l}`]),
  ];
  return (
    <div class="filter-bar">
      <button class="label-chip" onClick={() => setOpen(true)}>Фильтр:</button>
      {chips.map(([k, v, label]) => (
        <button key={k + v} class="label-chip on" aria-label={`Убрать: ${label}`}
          onClick={() => updateSettings({ filter: { ...f, [k]: f[k].filter((x) => x !== v) } })}>{label} ✕</button>
      ))}
      <button class="label-chip" style={{ color: 'var(--neg-text)' }} onClick={() => updateSettings({ filter: EMPTY_FILTER })}>Сбросить</button>
      {open && <FilterSheet onClose={() => setOpen(false)} />}
    </div>
  );
}

export function FilterSheet({ onClose }) {
  const s = useStore();
  const [f, setF] = useState({ ...EMPTY_FILTER, ...(s.settings.filter || {}) });
  const [view, setView] = useState(s.settings.view);
  const [openGroup, setOpenGroup] = useState(null);
  const accounts = alive(s.ledger.accounts);
  const labels = allLabels(s);
  const apply = () => { updateSettings({ filter: f, view }); onClose(); };
  const n = f.accounts.length + f.cats.length + f.labels.length;

  return (
    <Sheet title="Фильтр" onClose={onClose}
      right={<button class="link" onClick={() => { setF(EMPTY_FILTER); setView('all'); }}>Сбросить</button>}
      footer={<button class="btn primary" onClick={apply}>Показать{n || view !== 'all' ? ` · ${n + (view !== 'all' ? 1 : 0)}` : ''}</button>}>
      <div class="group-label">Чьи записи</div>
      <div style={{ padding: '0 var(--s4)' }}>
        <div class="who">
          <button class={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>Оба</button>
          {PEOPLE.map((p) => <button key={p} class={view === p ? 'on' : ''} onClick={() => setView(p)}><span style={{ color: PERSON_COLOR[p] }}>●</span> {p}</button>)}
        </div>
      </div>

      <div class="group-label">Счета {f.accounts.length ? `· ${f.accounts.length}` : '· все'}</div>
      {accountSections(accounts, s.settings.me).map((sec) => (
        <div key={sec.key}>
          <div class="note-box" style={{ paddingTop: 'var(--s3)' }}><span style={{ color: sec.color }}>●</span> {sec.title}
            <button class="link" style={{ float: 'right', fontSize: 'var(--fs-s)' }} onClick={() => {
              const ids = sec.items.map((a) => a.id);
              const allOn = ids.every((id) => f.accounts.includes(id));
              setF({ ...f, accounts: allOn ? f.accounts.filter((x) => !ids.includes(x)) : [...new Set([...f.accounts, ...ids])] });
            }}>все</button>
          </div>
          <div class="list">
            {sec.items.map((a) => (
              <CheckRow key={a.id} on={f.accounts.includes(a.id)} onClick={() => setF({ ...f, accounts: toggle(f.accounts, a.id) })}
                icon={<span class="dot" style={{ background: a.color, width: 18, height: 18 }} />} label={a.name} />
            ))}
          </div>
        </div>
      ))}

      <div class="group-label">Категории {f.cats.length ? `· ${f.cats.length}` : '· все'}</div>
      <div class="list">
        {GROUPS.map((g) => {
          const groupOn = f.cats.includes(g.id);
          const subsOn = g.subs.filter((_, i) => f.cats.includes(`${g.id}.${i}`)).length;
          return (
            <div key={g.id}>
              <div class="row" style={{ gap: 'var(--s3)' }}>
                <button class={`check${groupOn ? ' on' : ''}`} role="checkbox" aria-checked={groupOn} aria-label={`Вся группа «${g.name}»`}
                  onClick={() => setF({ ...f, cats: toggle(f.cats.filter((c) => !c.startsWith(g.id + '.')), g.id) })}>{groupOn ? '✓' : ''}</button>
                <CatIcon catId={`${g.id}.0`} size={32} />
                <button class="rl" style={{ textAlign: 'left' }} aria-expanded={openGroup === g.id} onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}>
                  {g.name}{subsOn ? <span class="muted"> · {subsOn}</span> : ''}
                </button>
                <button class="chev" aria-label="Подкатегории" onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}>{openGroup === g.id ? '⌄' : '›'}</button>
              </div>
              {openGroup === g.id && g.subs.map((name, i) => {
                const id = `${g.id}.${i}`;
                const on = groupOn || f.cats.includes(id);
                return (
                  <CheckRow key={id} indent on={on} disabled={groupOn} label={i === 0 ? `${name} (общее)` : name}
                    onClick={() => !groupOn && setF({ ...f, cats: toggle(f.cats, id) })} />
                );
              })}
            </div>
          );
        })}
      </div>

      <div class="group-label">Метки {f.labels.length ? `· ${f.labels.length}` : ''}</div>
      {labels.length === 0 ? (
        <div class="note-box">Меток пока нет. Их можно добавить в записи в поле «Метки», например «отпуск» или «ремонт».</div>
      ) : (
        <div style={{ padding: '0 var(--s4)' }}>
          {labels.map((l) => <button key={l} class={`label-chip${f.labels.includes(l) ? ' on' : ''}`} onClick={() => setF({ ...f, labels: toggle(f.labels, l) })}>#{l}</button>)}
        </div>
      )}
    </Sheet>
  );
}

const CheckRow = ({ on, onClick, icon, label, indent, disabled }) => (
  <button class="row" style={{ paddingLeft: indent ? 64 : undefined, opacity: disabled ? 0.6 : 1 }} role="checkbox" aria-checked={on} onClick={onClick}>
    <span class={`check${on ? ' on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</span>
    {icon}
    <span class="rl">{label}</span>
  </button>
);
