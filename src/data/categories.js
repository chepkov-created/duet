// Category tree. Group ids are stable, sub ids are `${group}.${n}` and never renumbered.
// The first sub of every group is the group itself ("general" bucket).
// The family can rename, add and hide categories in the app: those edits live in the shared ledger
// (collection `categories`) and are laid over this base tree by applyCategoryEdits().

const BASE = [
  {
    id: 'food', name: 'Еда и напитки', color: 'var(--cat-red)', icon: '🍅', type: 'expense',
    subs: ['Еда и напитки', 'Продукты', 'Рестораны, фастфуд', 'Напитки, бары'],
  },
  {
    id: 'shop', name: 'Покупки', color: 'var(--cat-sky)', icon: '🛍️', type: 'expense',
    subs: ['Покупки', 'Одежда и обувь', 'Украшения, аксессуары', 'Здоровье и красота', 'Дети', 'Для дома',
      'Питомцы', 'Техника, электроника', 'Подарки', 'Канцелярия, инструменты', 'Реквизит для съёмок', 'Аптека'],
  },
  {
    id: 'home', name: 'Жильё', color: 'var(--cat-orange)', icon: '🏠', type: 'expense',
    subs: ['Жильё', 'Аренда', 'Ипотека', 'Коммунальные платежи', 'Бытовые услуги', 'Ремонт и обслуживание', 'Страхование имущества'],
  },
  {
    id: 'trans', name: 'Транспорт', color: 'var(--cat-slate)', icon: '🚌', type: 'expense',
    subs: ['Транспорт', 'Общественный транспорт', 'Такси', 'Дальние поездки', 'Командировки'],
  },
  {
    id: 'car', name: 'Автомобиль', color: 'var(--cat-violet)', icon: '🚗', type: 'expense',
    subs: ['Автомобиль', 'Топливо', 'Парковка', 'Обслуживание авто', 'Аренда авто', 'Автострахование', 'Лизинг'],
  },
  {
    id: 'life', name: 'Жизнь и досуг', color: 'var(--cat-lime)', icon: '🎭', type: 'expense',
    subs: ['Жизнь и досуг', 'Врачи, медицина', 'Уход, красота', 'Спорт, фитнес', 'Концерты, события', 'Важные события',
      'Хобби', 'Обучение, развитие', 'Подписки', 'Кино и ТВ', 'Путешествия, отели', 'Благотворительность, подарки',
      'Съёмки, проекты, работа', 'Игры, развлечения'],
  },
  {
    id: 'tech', name: 'Связь, ПК', color: 'var(--cat-indigo)', icon: '💻', type: 'expense',
    subs: ['Связь, ПК', 'Мобильная связь', 'Интернет', 'Софт, приложения, игры', 'Почта, доставка писем'],
  },
  {
    id: 'fin', name: 'Финансовые расходы', color: 'var(--cat-teal)', icon: '🏦', type: 'expense',
    subs: ['Финансовые расходы', 'Налоги', 'Страховки', 'Кредиты, займы', 'Штрафы', 'Оплата услуг людей', 'Комиссии, сборы', 'Доставка'],
  },
  {
    id: 'inv', name: 'Инвестиции', color: 'var(--cat-pink)', icon: '📈', type: 'expense',
    subs: ['Инвестиции', 'Недвижимость', 'Транспорт, имущество', 'Ценные бумаги', 'Накопления', 'Коллекции'],
  },
  {
    id: 'other', name: 'Другое', color: 'var(--cat-brown)', icon: '📦', type: 'expense',
    subs: ['Другое', 'Пожертвования'],
  },
  {
    // Money sent to other people (not between your own cards). Separate, so it does not look like shopping.
    id: 'p2p', name: 'Переводы людям', color: 'var(--cat-grey)', icon: '👥', type: 'expense',
    subs: ['Переводы людям', 'Семье', 'Друзьям', 'В долг'],
  },
  {
    // "Изменение баланса счёта": a correction to match the real balance. Moves money, never counted as spending or income.
    id: 'adj', name: 'Изменение баланса счёта', color: 'var(--cat-grey)', icon: '⚖️', type: 'system',
    subs: ['Изменение баланса счёта'],
  },
  {
    id: 'inc', name: 'Доход', color: 'var(--cat-gold)', icon: '💰', type: 'income',
    subs: ['Доход', 'Зарплата', 'Проценты, дивиденды', 'Продажа вещей', 'Аренда (доход)', 'Стипендия', 'Подработка',
      'Кэшбэк, бонусы', 'Выигрыши, прочее', 'Возвраты', 'Алименты', 'Подарки (доход)', 'Переводы от людей'],
  },
];

export const BASE_CATEGORY_IDS = new Set(BASE.flatMap((g) => [g.id, ...g.subs.map((_, i) => `${g.id}.${i}`)]));

// Live bindings: rebuilt whenever the family edits categories, so every screen sees the new names.
export let GROUPS = [];       // visible groups, each with .cats (visible subcategories)
export let ALL_GROUPS = [];   // including hidden ones, for the categories editor
export let CATEGORIES = [];   // every category, hidden ones too (old records still need their name)
export let EXPENSE_GROUPS = [];
export let INCOME_GROUPS = [];
let byId = {};
let groupById = {};

/** @param {Array<{id:string, kind:'group'|'cat', name?:string, group?:string, type?:string, color?:string, icon?:string, hidden?:boolean}>} edits */
export function applyCategoryEdits(edits = []) {
  const ed = Object.fromEntries(edits.filter((e) => !e.deleted).map((e) => [e.id, e]));
  const groups = BASE.map((g) => ({ id: g.id, name: g.name, color: g.color, icon: g.icon, type: g.type, custom: false,
    cats: g.subs.map((name, i) => ({ id: `${g.id}.${i}`, name, custom: false })) }));
  // new groups made in the app
  for (const e of Object.values(ed)) {
    if (e.kind === 'group' && !BASE_CATEGORY_IDS.has(e.id)) {
      groups.push({ id: e.id, name: e.name, color: e.color || 'var(--cat-brown)', icon: e.icon || '📁', type: e.type || 'expense', custom: true,
        cats: [{ id: `${e.id}.0`, name: e.name, custom: true }] });
    }
  }
  const gmap = Object.fromEntries(groups.map((g) => [g.id, g]));
  // new subcategories made in the app (sorted by creation, so the order is stable on both phones)
  for (const e of Object.values(ed).filter((x) => x.kind === 'cat' && !BASE_CATEGORY_IDS.has(x.id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    if (gmap[e.group] && !gmap[e.group].cats.some((c) => c.id === e.id)) gmap[e.group].cats.push({ id: e.id, name: e.name, custom: true });
  }
  // renames, colours, hiding
  for (const g of groups) {
    const ge = ed[g.id];
    if (ge) Object.assign(g, ge.name ? { name: ge.name } : {}, ge.color ? { color: ge.color } : {}, ge.icon ? { icon: ge.icon } : {}, { hidden: Boolean(ge.hidden) });
    for (const c of g.cats) {
      const ce = ed[c.id];
      if (ce) Object.assign(c, ce.name ? { name: ce.name } : {}, { hidden: Boolean(ce.hidden) });
      // the "general" sub follows the group name unless renamed on its own
      if (c.id === `${g.id}.0` && !(ce && ce.name) && ge && ge.name) c.name = ge.name;
    }
  }
  ALL_GROUPS = groups;
  CATEGORIES = groups.flatMap((g) => g.cats.map((c) => ({ ...c, group: g.id, color: g.color, icon: g.icon, type: g.type, groupHidden: Boolean(g.hidden) })));
  byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  GROUPS = groups.filter((g) => !g.hidden && g.type !== 'system').map((g) => ({ ...g, cats: g.cats.filter((c) => !c.hidden) }));
  EXPENSE_GROUPS = GROUPS.filter((g) => g.type === 'expense');
  INCOME_GROUPS = GROUPS.filter((g) => g.type === 'income');
}
applyCategoryEdits([]);

export const category = (id) => byId[id] || { id, name: 'Без категории', group: 'other', color: 'var(--cat-brown)', icon: '❔', type: 'expense' };
export const group = (id) => groupById[id];
export const groupOf = (catId) => groupById[category(catId).group];
/** Balance corrections are not spending or income. */
export const isAdjustment = (catId) => typeof catId === 'string' && catId.startsWith('adj.');
