// Category tree. Group ids are stable, sub ids are `${group}.${n}` and never renumbered.
// The first sub of every group is the group itself ("general" bucket).

export const GROUPS = [
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
    id: 'inc', name: 'Доход', color: 'var(--cat-gold)', icon: '💰', type: 'income',
    subs: ['Доход', 'Зарплата', 'Проценты, дивиденды', 'Продажа вещей', 'Аренда (доход)', 'Стипендия', 'Подработка',
      'Кэшбэк, бонусы', 'Выигрыши, прочее', 'Возвраты', 'Алименты', 'Подарки (доход)', 'Переводы от людей'],
  },
];

export const CATEGORIES = GROUPS.flatMap((g) =>
  g.subs.map((name, i) => ({ id: `${g.id}.${i}`, name, group: g.id, color: g.color, icon: g.icon, type: g.type }))
);

const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const groupById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

export const category = (id) => byId[id] || { id, name: 'Без категории', group: 'other', color: 'var(--cat-brown)', icon: '❔', type: 'expense' };
export const group = (id) => groupById[id];
export const groupOf = (catId) => groupById[category(catId).group];
export const EXPENSE_GROUPS = GROUPS.filter((g) => g.type === 'expense');
export const INCOME_GROUPS = GROUPS.filter((g) => g.type === 'income');
