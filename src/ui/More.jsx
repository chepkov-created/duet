import { useNav } from './App.jsx';
import { Screen } from './kit.jsx';
import { useStore, syncConfigured } from '../data/store.js';
import { Records } from './Records.jsx';
import { Accounts } from './Accounts.jsx';
import { Settings, SyncScreen, About } from './Settings.jsx';
import { Reports } from './Reports.jsx';
import { TemplatesScreen } from './Templates.jsx';

export function SyncChip({ onClick }) {
  const s = useStore();
  const st = syncConfigured(s.settings) ? s.sync.status : 'off';
  const text = { off: 'Только на телефоне', idle: 'Синхронизация', syncing: 'Синхронизация…', ok: 'Синхронизировано', error: 'Ошибка синхр.', offline: 'Нет сети · сохранено' }[st];
  return <button class={`sync-chip ${st}`} onClick={onClick}><i aria-hidden="true" />{text}</button>;
}

export function More() {
  const s = useStore();
  const nav = useNav();
  const items = [
    ['📸', 'var(--fab)', 'Скриншот → записи', nav.scan],
    ['⚡', 'var(--warn)', 'Шаблоны', () => nav.push(TemplatesScreen, {}), `${(s.ledger.templates || []).filter((t) => !t.deleted).length} шт.`],
    ['☰', 'var(--fab)', 'Записи', () => nav.push(Records, {})],
    ['🏛️', 'var(--acc-blue)', 'Счета', () => nav.push(Accounts, {})],
    ['📊', 'var(--premium)', 'Отчёты', () => nav.push(Reports, {})],
    ['🔄', 'var(--cat-teal)', 'Синхронизация', () => nav.push(SyncScreen, {}), syncConfigured(s.settings) ? 'GitHub' : 'Выключена'],
    ['⚙️', 'var(--accent)', 'Настройки', () => nav.push(Settings, {})],
    ['💬', 'var(--surface-3)', 'О приложении', () => nav.push(About, {})],
  ];
  return (
    <Screen title="Ещё" right={<span class="muted">{s.settings.me}</span>}>
      <div class="more-grid">
        {items.map(([ico, bg, label, fn, sub]) => (
          <button key={label} class="more-item" onClick={fn}>
            <span class="app-ico" style={{ background: bg }} aria-hidden="true">{ico}</span>
            <span>{label}{sub && <><br /><small>{sub}</small></>}</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}
