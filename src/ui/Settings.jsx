import { useState } from 'preact/hooks';
import { useNav } from './App.jsx';
import { Screen, Row, PERSON_COLOR } from './kit.jsx';
import { useStore, updateSettings, syncNow, syncConfigured, PEOPLE, getState, replaceLedger, loadDemo, wipeLocal, mergeLedgers, refreshRates } from '../data/store.js';
import { Accounts } from './Accounts.jsx';
import { checkAccess } from '../data/github.js';

export function Onboarding() {
  return (
    <div class="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--s6)', gap: 'var(--s5)', minHeight: '100dvh' }}>
      <img src="./icon.svg" width="88" height="88" alt="" style={{ alignSelf: 'center' }} />
      <h1 style={{ textAlign: 'center', margin: 0, fontSize: 'var(--fs-3xl)' }}>Дуэт</h1>
      <p style={{ textAlign: 'center', color: 'var(--text-2)', margin: 0, lineHeight: 1.45 }}>Общий бюджет на двоих. Каждая запись помечена тем, кто её сделал, а смотреть можно и свои траты, и общие.</p>
      <div class="caption" style={{ textAlign: 'center' }}>Кто пользуется этим телефоном?</div>
      {PEOPLE.map((p) => (
        <button key={p} class="btn" style={{ fontSize: 'var(--fs-xl)' }} onClick={() => updateSettings({ me: p, view: p })}>
          <span style={{ color: PERSON_COLOR[p] }}>●</span> {p}
        </button>
      ))}
    </div>
  );
}

export function SyncScreen() {
  const s = useStore();
  const nav = useNav();
  const st = s.settings;
  // Prefilled with the family's data repo, so on a phone only the token has to be pasted.
  const [f, setF] = useState({ ghOwner: st.ghOwner || 'chepkov-created', ghRepo: st.ghRepo || 'duet-data', ghToken: st.ghToken, ghPath: st.ghPath || 'ledger.json' });
  const [check, setCheck] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value.trim() });
  const save = async () => {
    const missing = [['ghOwner', 'Владелец'], ['ghRepo', 'Репозиторий'], ['ghToken', 'Токен']].filter(([k]) => !f[k]).map(([, l]) => `«${l}»`);
    if (missing.length) { setCheck({ err: `Заполните: ${missing.join(', ')}` }); return; }
    setCheck({ busy: true });
    try {
      const info = await checkAccess({ owner: f.ghOwner, repo: f.ghRepo, token: f.ghToken });
      updateSettings(f);
      await syncNow();
      setCheck({ ok: `Подключено к ${info.fullName}${info.private ? '' : ' — внимание: репозиторий ПУБЛИЧНЫЙ, сделайте его приватным'}` });
    } catch (e) {
      setCheck({ err: e.message });
    }
  };
  const off = () => { updateSettings({ ghToken: '' }); setF({ ...f, ghToken: '' }); setCheck(null); };
  return (
    <Screen pushed title="Синхронизация" back="Назад" onBack={nav.pop}>
      <div class="note-box">
        Записи хранятся на телефоне и копируются в файл в вашем <b>приватном</b> репозитории GitHub. Оба телефона читают и дописывают этот файл, поэтому у Миши и Арины всегда одинаковые данные. Это бесплатно.
      </div>
      <div class="group-label">Состояние</div>
      <div class="list inset plain">
        <Row label="Статус" value={!syncConfigured(st) ? 'Выключена' : { idle: 'Ожидание', syncing: 'Идёт…', ok: 'Всё сохранено', error: 'Ошибка', offline: 'Нет сети, отправится позже' }[s.sync.status]} />
        {s.sync.at && <Row label="Последняя синхронизация" value={new Date(s.sync.at).toLocaleString('ru-RU')} />}
        {syncConfigured(st) && <Row label={<span class="accent">Синхронизировать сейчас</span>} chevron={false} onClick={syncNow} />}
      </div>
      {s.sync.error && <div class="error-box" role="alert">{s.sync.error}</div>}

      <div class="group-label">Репозиторий GitHub</div>
      <div class="list inset plain">
        <label class="row"><span class="rl">Владелец</span><input value={f.ghOwner} onInput={set('ghOwner')} placeholder="не заполнено" autoCapitalize="off" autoCorrect="off" /></label>
        <label class="row"><span class="rl">Репозиторий</span><input value={f.ghRepo} onInput={set('ghRepo')} placeholder="не заполнено" autoCapitalize="off" autoCorrect="off" /></label>
        <label class="row"><span class="rl">Файл</span><input value={f.ghPath} onInput={set('ghPath')} placeholder="не заполнено" autoCapitalize="off" /></label>
        <label class="row"><span class="rl">Токен</span><input type="password" value={f.ghToken} onInput={set('ghToken')} onChange={set('ghToken')} placeholder="вставьте токен" autoComplete="off" /></label>
      </div>
      <div style={{ padding: 'var(--s4)', display: 'grid', gap: 'var(--s2)' }}>
        <button class="btn primary" disabled={check?.busy} onClick={save}>{check?.busy ? 'Проверяю…' : 'Проверить и подключить'}</button>
        {syncConfigured(st) && <button class="btn danger" onClick={off}>Отключить на этом телефоне</button>}
      </div>
      {check?.ok && <div class="note-box" style={{ color: 'var(--pos-text)' }}>✓ {check.ok}</div>}
      {check?.err && <div class="error-box" role="alert">{check.err}</div>}
      <div class="note-box">
        <b>Как получить токен:</b> GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token. В «Repository access» выберите только репозиторий с данными, в «Permissions → Contents» поставьте <b>Read and write</b>. Один и тот же токен можно ввести на обоих телефонах. Токен хранится только на телефоне.
      </div>
    </Screen>
  );
}

export function Settings() {
  const s = useStore();
  const nav = useNav();
  const st = s.settings;
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(getState().ledger, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `duet-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = (e) => {
    const file = e.currentTarget.files[0];
    if (!file) return;
    file.text().then((t) => {
      try {
        const data = JSON.parse(t);
        if (!Array.isArray(data.records)) throw new Error();
        if (confirm('Добавить записи из файла к текущим? (Совпадающие записи обновятся)')) replaceLedger(mergeLedgers(getState().ledger, data));
      } catch { alert('Это не файл резервной копии Дуэта'); }
    });
  };
  return (
    <Screen pushed title="Настройки" back="Назад" onBack={nav.pop}>
      <div class="group-label">Этот телефон</div>
      <div class="list inset plain">
        <div class="row"><span class="rl">Я —</span>
          <div class="who">{PEOPLE.map((p) => <button key={p} class={st.me === p ? 'on' : ''} onClick={() => updateSettings({ me: p, view: p })}><span style={{ color: PERSON_COLOR[p] }}>●</span> {p}</button>)}</div>
        </div>
        <Row label="Синхронизация" value={syncConfigured(st) ? 'GitHub' : 'Выключена'} onClick={() => nav.push(SyncScreen, {})} />
      </div>

      <div class="list inset plain" style={{ marginTop: 'var(--s3)' }}>
        <Row label="Счета" onClick={() => nav.push(Accounts, {})} />
      </div>

      <div class="group-label">Курсы валют (для пересчёта в рубли)</div>
      <div class="list inset plain">
        {['USD', 'EUR'].map((c) => (
          <label class="row" key={c}><span class="rl">1 {c === 'USD' ? '$' : '€'} =</span>
            <input inputMode="decimal" value={st.rates?.[c] ? String(Math.round(st.rates[c] * 100) / 100).replace('.', ',') : ''} placeholder="курс, ₽"
              onChange={(e) => { const v = Number(e.currentTarget.value.replace(',', '.')); if (v > 0) updateSettings({ rates: { ...st.rates, [c]: v, manual: true, at: Date.now() } }); }} />
            <span class="muted">₽</span>
          </label>
        ))}
        <Row label={<span class="accent">Взять курс ЦБ сейчас</span>} chevron={false} onClick={() => refreshRates(true)} value={st.rates?.manual ? 'сейчас вручную' : st.rates?.at ? `ЦБ, ${new Date(st.rates.at).toLocaleDateString('ru-RU')}` : ''} />
      </div>

      <div class="group-label">Данные</div>
      <div class="list inset plain">
        <Row label={<span class="accent">Скачать резервную копию</span>} chevron={false} onClick={exportJson} />
        <label class="row"><span class="rl accent">Загрузить из копии</span><input type="file" accept="application/json,.json" class="sr-only" onChange={importJson} /></label>
        <Row label={<span class="accent">Заполнить примером</span>} chevron={false} onClick={() => confirm('Заменить данные на этом телефоне примером? При включённой синхронизации пример попадёт и в общий файл.') && loadDemo()} />
        <Row label={<span style={{ color: 'var(--neg-text)' }}>Очистить данные на телефоне</span>} chevron={false} onClick={() => confirm('Удалить все записи на этом телефоне? Данные в GitHub останутся и вернутся при следующей синхронизации.') && wipeLocal()} />
      </div>
    </Screen>
  );
}

export function About() {
  const nav = useNav();
  return (
    <Screen pushed title="О приложении" back="Назад" onBack={nav.pop}>
      <div class="note-box" style={{ fontSize: 'var(--fs-m)' }}>
        <p><b>Дуэт</b> — семейный учёт денег для двоих.</p>
        <p>• Каждая запись помечена — Миша или Арина. Переключатель «Общее / Миша / Арина» вверху меняет, чьи траты видно.</p>
        <p>• Кнопка с камерой разбирает скриншот операций из банка и предлагает готовые записи. Бесплатно, прямо на телефоне.</p>
        <p>• Данные живут на телефоне и синхронизируются через приватный репозиторий GitHub. Работает без интернета, синхронизируется, когда сеть появляется.</p>
        <p>Версия 1.0</p>
      </div>
    </Screen>
  );
}
