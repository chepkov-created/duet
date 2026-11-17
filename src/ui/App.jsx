import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { Svg } from './kit.jsx';
import { useStore, scheduleSync, syncNow, syncConfigured, refreshRates, getState, updateSettings } from '../data/store.js';
import { Overview } from './Overview.jsx';
import { Planning } from './Planning.jsx';
import { Stats } from './Stats.jsx';
import { More } from './More.jsx';
import { RecordForm } from './RecordForm.jsx';
import { Scan } from './Scan.jsx';
import { Onboarding } from './Settings.jsx';
import { duePayments } from './Payments.jsx';
import { ShakeListener } from './Shake.jsx';

const Nav = createContext(null);
export const useNav = () => useContext(Nav);

export function App() {
  const s = useStore();
  const [tab, setTab] = useState('overview');
  const [stack, setStack] = useState([]); // [{C, props}]
  const [sheet, setSheet] = useState(null); // {C, props}
  const [toast, setToast] = useState(null); // {text, undo, id}

  useEffect(() => {
    if (syncConfigured()) syncNow(); else scheduleSync();
    refreshRates();
    // Each launch starts with your own records; the switch can show shared or the other person until the app is closed.
    const st = getState().settings;
    if (st.me && st.view !== st.me) updateSettings({ view: st.me });
    const onVis = () => document.visibilityState === 'visible' && syncConfigured() && syncNow();
    document.addEventListener('visibilitychange', onVis);
    // Connection is back: send what was saved offline right away.
    const onOnline = () => { if (syncConfigured()) syncNow(); refreshRates(); };
    window.addEventListener('online', onOnline);
    const t = setInterval(() => syncConfigured() && document.visibilityState === 'visible' && syncNow(), 60000);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline); clearInterval(t); };
  }, []);

  const nav = {
    push: (C, props = {}) => setStack((st) => [...st, { C, props }]),
    pop: () => setStack((st) => st.slice(0, -1)),
    reset: () => setStack([]),
    sheet: (C, props = {}) => setSheet({ C, props }),
    closeSheet: () => setSheet(null),
    record: (record, defaults, opts = {}) => setSheet({ C: RecordForm, props: { record, defaults, template: opts.template } }),
    toast: (text, undo) => {
      const id = Date.now();
      setToast({ text, undo, id });
      setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 5000);
    },
    scan: () => setSheet({ C: Scan, props: {} }),
    tab: (t) => { setStack([]); setTab(t); window.scrollTo(0, 0); },
  };

  if (!s.settings.me) return <Nav.Provider value={nav}><Onboarding /></Nav.Provider>;

  const Tab = { overview: Overview, planning: Planning, stats: Stats, more: More }[tab];
  const top = stack[stack.length - 1];

  return (
    <Nav.Provider value={nav}>
      <div aria-hidden={top ? 'true' : undefined} inert={top ? true : undefined}><Tab /></div>
      {top && <top.C key={stack.length} {...top.props} />}
      {!top && (
        <nav class="tabbar" aria-label="Разделы">
          <TabBtn id="overview" cur={tab} set={nav.tab} label="Обзор" Icon={Svg.home} />
          <TabBtn id="planning" cur={tab} set={nav.tab} label="Планы" Icon={Svg.clock} badge={duePayments(s).length} />
          <button class="fab" aria-label="Добавить запись" onClick={() => nav.record(null)}><Svg.plus /></button>
          <TabBtn id="stats" cur={tab} set={nav.tab} label="Статистика" Icon={Svg.bars} />
          <TabBtn id="more" cur={tab} set={nav.tab} label="Ещё" Icon={Svg.more} />
        </nav>
      )}
      <ShakeListener toast={nav.toast} />
      {sheet && <sheet.C {...sheet.props} />}
      {toast && (
        <div class="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button class="link strong" onClick={() => { toast.undo(); setToast(null); }}>Отменить</button>}
        </div>
      )}
    </Nav.Provider>
  );
}

const TabBtn = ({ id, cur, set, label, Icon, badge }) => (
  <button class={`tab${cur === id ? ' active' : ''}`} aria-current={cur === id ? 'page' : undefined} onClick={() => set(id)} style={{ position: 'relative' }}>
    <Icon />{badge > 0 && <span class="badge-dot tab-badge">{badge}</span>}
    <span>{label}</span>
  </button>
);
