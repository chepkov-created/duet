// Turns text read from a bank screenshot (on-device OCR or text copied on the iPhone)
// into transactions. Free and offline: rules plus what the family categorised before.

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const MONTH_RE = /(\d{1,2})\s+(январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])(?:\s+(\d{4}))?/i;
const NUMERIC_DATE_RE = /\b(\d{2})\.(\d{2})(?:\.(\d{2,4}))?\b/;

// "−1 234,56 ₽", "+9 500 ₽", "127,89 Р", "2 999.00": needs kopecks or a currency mark,
// so times (19:28) and plain counters are not taken for money.
const AMOUNT_RE = /([+\-−–])?\s?((?:\d{1,3}(?:[   ]\d{3})+|\d+)(?:[,.]\d{2})?)\s*(₽|руб\.?|[РPр](?![а-яa-z]))?/gi;

const SKIP_RE = /(баланс|остаток|итого|всего|доступно|кэшбэк за месяц|показать|наибольшие|бюджет|лимит)/i;
const DECLINED_RE = /(отклон|отмен|не выполн|ошибка)/i;
const INCOME_RE = /(зачислен|поступлен|пополнен|зарплат|аванс|кэшбэк|кешбэк|cashback|возврат|перевод от|входящ|проценты|доход)/i;
const TRANSFER_RE = /(между (своими )?сч[её]тами|между своими|на свой сч[её]т|со своего сч[её]та|перевод себе)/i;

/** keyword (lowercase substring) → category id; order matters, first match wins */
const RULES = [
  [/(между сч|между своими)/, 'fin.0'],
  [/(супермаркет|продукт|пят[её]рочк|магнит|перекр[её]ст|вкусвилл|лента|ашан|дикси|metro c&c|окей|globus|глобус|самокат|азбука вкуса|верный|светофор|чижик|spar|спар|fix price|фикс прайс|красное.?белое|бристоль)/, 'food.1'],
  [/(ресторан|кафе|кофе|coffee|кофейн|бургер|burger|kfc|ростикс|вкусно и точка|макдоналдс|додо|пицц|суши|роллы|шаурм|фастфуд|столов|якитория|теремок|cofix|шоколадниц|delivery club|яндекс еда|яндекс.еда)/, 'food.2'],
  [/(бар|паб|алкогол|винлаб|wine)/, 'food.3'],
  [/(азс|топливо|бензин|лукойл|роснефть|газпромнефть|газпром нефть|татнефть|shell|neste|teboil|bp )/, 'car.1'],
  [/(парковк|паркинг)/, 'car.2'],
  [/(автосервис|шиномонтаж|автомойк|мойка|запчаст|автозапчаст)/, 'car.3'],
  [/(каршеринг|делимобиль|яндекс драйв|ситидрайв|belkacar)/, 'car.4'],
  [/(осаго|каско)/, 'car.5'],
  [/(метро|мцд|автобус|троллейбус|трамвай|транспорт|тройка|подорожник|электричк|аэроэкспресс)/, 'trans.1'],
  [/(такси|яндекс go|яндекс.go|uber|ситимобил|maxim|максим)/, 'trans.2'],
  [/(ржд|аэрофлот|авиабилет|ж\/д|поезд|туту|aviasales|победа|s7|уральские авиалинии)/, 'trans.3'],
  [/(аптек|apteka|здравсити|ригла|горздрав|36.6)/, 'shop.11'],
  [/(одежд|обувь|zara|lamoda|ламода|gloria|глория|спортмастер|befree|love republic|o'stin)/, 'shop.1'],
  [/(золотое яблоко|летуаль|л.этуаль|рив гош|косметик|подружка)/, 'shop.3'],
  [/(детск|детский мир)/, 'shop.4'],
  [/(леруа|leroy|оби|икеа|ikea|hoff|хофф|хозтовар|для дома|fix price)/, 'shop.5'],
  [/(зоомагазин|четыре лапы|зоо|бетховен)/, 'shop.6'],
  [/(dns|днс|м\.видео|мвидео|эльдорадо|ситилинк|электроник|re:store|apple)/, 'shop.7'],
  [/(цвет|флор|подарк)/, 'shop.8'],
  [/(ozon|озон|wildberries|вайлдберриз|wb |яндекс маркет|маркетплейс|aliexpress|мегамаркет)/, 'shop.0'],
  [/(аренда|квартплат)/, 'home.1'],
  [/(жкх|коммунал|электроэнерг|мосэнерго|водоканал|газ |мособлгаз|госуслуги жкх|квартплата)/, 'home.3'],
  [/(мтс|билайн|мегафон|теле2|tele2|yota|йота|мобильн|сотов|связь)/, 'tech.1'],
  [/(интернет|ростелеком|дом\.ру|провайдер)/, 'tech.2'],
  [/(app store|apple\.com|google play|steam|playstation|xbox|впн|vpn|софт|программн|приложени)/, 'tech.3'],
  [/(почта россии|сдэк|cdek|boxberry|пэк)/, 'tech.4'],
  [/(налог|фнс)/, 'fin.1'],
  [/(страхов)/, 'fin.2'],
  [/(кредит|займ|ипотек|погашени)/, 'fin.3'],
  [/(штраф|гибдд)/, 'fin.4'],
  [/(комисси|обслуживани|сбор)/, 'fin.6'],
  [/(доставк)/, 'fin.7'],
  [/(клиник|поликлиник|стоматолог|медицин|анализ|инвитро|гемотест|врач)/, 'life.1'],
  [/(салон|барбер|парикмахер|маникюр|красот|спа)/, 'life.2'],
  [/(фитнес|спортзал|бассейн|world class|ddx|x-fit)/, 'life.3'],
  [/(театр|концерт|кино(?!поиск)|билет|афиша|музей)/, 'life.4'],
  [/(курс|обучени|школа|skillbox|нетология|литрес|книг)/, 'life.7'],
  [/(подписк|яндекс плюс|плюс|okko|иви|ivi|кинопоиск|start|wink|spotify|youtube|netflix)/, 'life.8'],
  [/(отел|гостиниц|booking|островок|airbnb|суточно)/, 'life.10'],
  [/(игр|кальян|боулинг|квест)/, 'life.13'],
  [/(зарплат|аванс)/, 'inc.1'],
  [/(проценты|дивиденд)/, 'inc.2'],
  [/(кэшбэк|кешбэк|cashback|бонус)/, 'inc.7'],
  [/(возврат)/, 'inc.9'],
];

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function parseDate(line, today) {
  const l = line.toLowerCase();
  // \b does not work with Cyrillic in JS, so word edges are spelled out.
  const word = (w) => new RegExp(`(^|[^а-я])${w}([^а-я]|$)`).test(l);
  if (word('сегодня')) return new Date(today);
  if (word('позавчера')) { const d = new Date(today); d.setDate(d.getDate() - 2); return d; }
  if (word('вчера')) { const d = new Date(today); d.setDate(d.getDate() - 1); return d; }
  let m = l.match(MONTH_RE);
  if (m) {
    const month = MONTHS.findIndex((p) => m[2].startsWith(p === 'ма' ? 'ма' : p));
    let year = m[3] ? Number(m[3]) : today.getFullYear();
    const d = new Date(year, month, Number(m[1]));
    if (!m[3] && d > today) d.setFullYear(year - 1); // "28 декабря" seen in January
    return d;
  }
  m = l.match(NUMERIC_DATE_RE);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear();
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (d.getMonth() === Number(m[2]) - 1 && Number(m[1]) <= 31) return d;
  }
  return null;
}

const timeOf = (line) => { const m = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };

/** Finds the money amount in a line; returns {sign, value, index, raw} or null. */
function findAmount(line) {
  let best = null;
  for (const m of line.matchAll(AMOUNT_RE)) {
    const [raw, sign, num, cur] = m;
    const hasKop = /[,.]\d{2}$/.test(num);
    if (!hasKop && !cur) continue;
    const value = Number(num.replace(/[   ]/g, '').replace(',', '.'));
    if (!value || value > 10_000_000) continue;
    // a year or day number right after a month name is not money
    if (!hasKop && /^(19|20)\d{2}$/.test(num)) continue;
    best = { sign: sign ? (sign === '+' ? '+' : '-') : '', value, index: m.index, raw };
  }
  return best;
}

/**
 * @param {string} text  raw text, one visual line per line
 * @param {{today?: Date, memory?: Map<string,string>}} opts  memory: normalised payee -> categoryId
 */
export function parseBankText(text, { today = new Date(), memory = new Map() } = {}) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[|_©®@•·]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  let currentDate = null;
  let blockStart = 0; // first line of the operation that ends at the next amount
  const isHeader = (l) => {
    const d = parseDate(l, today);
    return d && l.replace(MONTH_RE, '').replace(/сегодня|вчера|позавчера|,|\d{4}|[а-я]{2,3}\.?$/gi, '').trim().length < 4 ? d : null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const amt = findAmount(line);
    if (!amt) {
      const d = isHeader(line);
      if (d) { currentDate = d; blockStart = i + 1; }
      continue;
    }
    if (SKIP_RE.test(line)) { blockStart = i + 1; continue; }

    let payee = line.slice(0, amt.index).replace(MONTH_RE, '').replace(/(сегодня|вчера)/gi, '').trim();
    let ctx;
    let inline = payee.replace(/[^a-zа-яё]/gi, '').length >= 3;
    if (inline) {
      // "Name  -127,89 ₽" style: details follow under the line.
      ctx = [payee];
      let k = i + 1;
      for (; k < lines.length && k <= i + 3 && !findAmount(lines[k]) && !isHeader(lines[k]); k++) ctx.push(lines[k]);
      blockStart = k;
    } else {
      // Bank style: name and category on the lines above, amount alone.
      const block = lines.slice(Math.max(blockStart, i - 4), i).filter((l) => !isHeader(l));
      if (!block.length) { blockStart = i + 1; continue; }
      payee = block[0];
      ctx = block;
      blockStart = i + 1;
    }
    const context = ctx.join(' ');
    if (DECLINED_RE.test(context)) continue;

    const dateHere = inline ? parseDate(line, today) || parseDate(lines[i + 1] || '', today) : null;
    const date = dateHere || currentDate || today;
    const transfer = TRANSFER_RE.test(context);
    const type = transfer ? 'transfer' : amt.sign === '+' || (!amt.sign && INCOME_RE.test(context)) ? 'income' : 'expense';

    const key = norm(payee);
    let categoryId = memory.get(key);
    let confidence = categoryId ? 'high' : 'low';
    if (!categoryId) {
      const hay = norm(context) + ' ';
      const rule = RULES.find(([re, id]) => re.test(hay) && (type === 'income') === id.startsWith('inc'));
      categoryId = rule ? rule[1] : type === 'income' ? 'inc.0' : 'other.0';
      if (rule) confidence = 'high';
    }
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    out.push({
      type, amount: amt.value, date: iso, time: timeOf(line),
      payee: payee.replace(/\s*[-−–+]\s*$/, '').slice(0, 60), description: '', categoryId, confidence,
    });
  }
  return out;
}

/** payee -> category, learned from the records you already have (the latest choice wins). */
export function categoryMemory(records) {
  const mem = new Map();
  const sorted = [...records].filter((r) => r.payee && r.categoryId && !r.deleted).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  for (const r of sorted) mem.set(norm(r.payee), r.categoryId);
  return mem;
}
