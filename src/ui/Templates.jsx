import { useNav } from './App.jsx';
import { Screen, Sheet, Card, CatIcon, Empty } from './kit.jsx';
import { useStore, alive, addFromTemplate, remove } from '../data/store.js';
import { category } from '../data/categories.js';
import { rub } from '../data/format.js';

const sorted = (list) => [...list].sort((a, b) => (b.uses || 0) - (a.uses || 0) || a.name.localeCompare(b.name, 'ru'));

/** One tap: the record is added now, with an undo in the toast. */
export function useQuickAdd() {
  const nav = useNav();
  return (t) => {
    const rec = addFromTemplate(t);
    nav.toast(`Добавлено: ${t.name} · ${rub(t.type === 'income' ? t.amount : -t.amount)}`, () => remove('records', rec.id));
  };
}

const sign = (t) => (t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0);

function TemplateTile({ t, onClick }) {
  return (
    <button class="tpl" onClick={onClick}>
      {t.type === 'transfer' ? <span class="cat-ico" style={{ background: 'var(--surface-3)', width: 36, height: 36 }}>⇄</span> : <CatIcon catId={t.categoryId} size={36} />}
      <span class="tpl-name">{t.name}</span>
      <span class={`tpl-amt num ${sign(t) < 0 ? 'neg' : sign(t) > 0 ? 'pos' : ''}`}>{t.amount ? rub(sign(t) * t.amount || t.amount) : 'сумма?'}</span>
    </button>
  );
}

/** Card on Overview: a grid of templates, one tap adds the record. */
export function QuickTemplates() {
  const s = useStore();
  const nav = useNav();
  const quick = useQuickAdd();
  const list = sorted(alive(s.ledger.templates || []));
  return (
    <Card title="Шаблоны" menu={<button class="link" onClick={() => nav.push(TemplatesScreen, {})}>Изменить</button>}>
      {list.length === 0 ? (
        <Empty icon="⚡" text="Шаблонов пока нет">
          <span class="muted" style={{ maxWidth: 280 }}>Сохраните частую трату как шаблон, и потом она добавляется одним нажатием.</span>
          <button class="link strong" onClick={() => nav.record(null, null, { template: true })}>Создать шаблон</button>
        </Empty>
      ) : (
        <div class="tpl-grid">
          {list.slice(0, 8).map((t) => <TemplateTile key={t.id} t={t} onClick={() => (t.amount ? quick(t) : nav.record(null, t))} />)}
        </div>
      )}
    </Card>
  );
}

/** Opened from the record form: tap fills the form, or adds right away. */
export function TemplatePicker({ onFill, onClose }) {
  const s = useStore();
  const nav = useNav();
  const quick = useQuickAdd();
  const list = sorted(alive(s.ledger.templates || []));
  return (
    <Sheet title="Шаблоны" onClose={onClose} left={<button class="link" onClick={onClose}>Назад</button>}
      right={<button class="link" onClick={() => { nav.closeSheet(); nav.push(TemplatesScreen, {}); }}>Изменить</button>}>
      {list.length === 0 && <Empty icon="⚡" text="Шаблонов пока нет"><span class="muted">Заполните запись и нажмите «Сохранить как шаблон».</span></Empty>}
      <div class="list">
        {list.map((t) => (
          <div key={t.id} class="row">
            <button class="rl" style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }} onClick={() => onFill(t)}>
              <CatIcon catId={t.categoryId} size={36} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block' }}>{t.name}</span>
                <span class="muted">{t.type === 'transfer' ? 'Перевод' : category(t.categoryId).name}{t.amount ? ` · ${rub(t.amount)}` : ''}</span>
              </span>
            </button>
            {t.amount > 0 && <button class="pill-btn" onClick={() => { quick(t); nav.closeSheet(); }}>+ Сразу</button>}
          </div>
        ))}
      </div>
      <div class="note-box">Нажмите на шаблон, чтобы заполнить форму и поправить, например, сумму. «+ Сразу» добавляет запись без вопросов.</div>
    </Sheet>
  );
}

/** Manage templates: edit, delete, add. */
export function TemplatesScreen() {
  const s = useStore();
  const nav = useNav();
  const accounts = alive(s.ledger.accounts);
  const list = sorted(alive(s.ledger.templates || []));
  return (
    <Screen pushed title="Шаблоны" back="Назад" onBack={nav.pop} right={<button class="link" onClick={() => nav.record(null, null, { template: true })}>Добавить</button>}>
      <div class="note-box">Шаблон — заготовка частой операции: кофе, бензин, проезд. На Обзоре нажатие на шаблон сразу добавляет запись. Шаблоны общие для обоих телефонов.</div>
      {list.length === 0 && <Empty icon="⚡" text="Шаблонов нет" />}
      {list.length > 0 && (
        <div class="list inset">
          {list.map((t) => (
            <button key={t.id} class="row" onClick={() => nav.record(null, null, { template: t })}>
              <CatIcon catId={t.categoryId} owner={t.owner} size={36} />
              <span class="rl">
                <span style={{ display: 'block' }}>{t.name}</span>
                <span class="muted">{category(t.categoryId).name} · {accounts.find((a) => a.id === t.accountId)?.name || '—'}{t.uses ? ` · использован ${t.uses}×` : ''}</span>
              </span>
              <span class="rv num">{t.amount ? rub(t.amount) : '—'}</span>
              <span class="chev" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}
