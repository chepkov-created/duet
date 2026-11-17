// Receipt / Ozon order -> items, through GitHub Models (free with a GitHub account, token with "Models: read").
// The photo goes to GitHub's model service only when you press "Распознать".

import { CATEGORIES } from '../data/categories.js';

const ENDPOINT = 'https://models.github.ai/inference/chat/completions';
export const RECEIPT_MODELS = [['openai/gpt-4.1-mini', 'GPT-4.1 mini (рекомендую)'], ['openai/gpt-4o-mini', 'GPT-4o mini'], ['openai/gpt-4.1', 'GPT-4.1 (точнее, меньше запросов в день)']];

/** Long receipts are tall: keep text readable but the request small. */
export async function receiptImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

const prompt = () => {
  const cats = CATEGORIES.filter((c) => c.type === 'expense' && !c.hidden && !c.groupHidden).map((c) => `${c.id} = ${c.name}`).join('\n');
  return `Это фото кассового чека или скриншот заказа (Озон, Wildberries, доставка).
Выпиши все купленные позиции. Ответь ТОЛЬКО JSON без пояснений:
{"store": "магазин", "date": "YYYY-MM-DD или пусто", "time": "HH:MM или пусто", "total": число — итог к оплате,
 "items": [{"name": "название товара коротко по-русски", "qty": число, "sum": число — стоимость строки после скидок, "categoryId": "id из списка"}]}
Правила: не выдумывай товары; скидки учитывай в sum; доставку и сервисный сбор — отдельной позицией с categoryId fin.7 или fin.6.
categoryId выбирай строго из списка:
${cats}`;
};

export class ReceiptError extends Error {}

/** @returns {Promise<{store:string,date:string,time:string,total:number,items:Array<{name,qty,sum,categoryId}>}>} */
export async function recognizeReceipt({ token, model, images }) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt() }, ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))] }],
      }),
    });
  } catch {
    throw new ReceiptError('Не удалось связаться с GitHub Models. Если интернет есть — значит, GitHub не пускает запросы прямо из браузера; напишите, сделаю обходной путь.');
  }
  if (res.status === 401 || res.status === 403) throw new ReceiptError('Токен не подходит: нужен токен GitHub с правом «Models: Read».');
  if (res.status === 429) throw new ReceiptError('Бесплатный лимит GitHub на сегодня или на минуту исчерпан. Попробуйте позже.');
  if (res.status === 413) throw new ReceiptError('Фото слишком большое для бесплатного лимита. Сфотографируйте чек частями.');
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* not json */ }
    throw new ReceiptError(`GitHub Models ответил ${res.status}${msg ? ': ' + msg : ''}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  let out;
  try { out = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim()); } catch { throw new ReceiptError('Не получилось разобрать ответ. Попробуйте ещё раз или другое фото.'); }
  const valid = new Set(CATEGORIES.map((c) => c.id));
  const num = (v) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
  out.items = (out.items || []).map((it) => ({
    name: String(it.name || '').slice(0, 80), qty: num(it.qty) || 1, sum: num(it.sum),
    categoryId: valid.has(it.categoryId) ? it.categoryId : undefined,
  })).filter((it) => it.name && it.sum > 0);
  out.total = num(out.total) || out.items.reduce((a, it) => a + it.sum, 0);
  return out;
}

/** Cheap check that the token works (text only). */
export async function checkModelsToken(token, model) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Ответь одним словом: ок' }] }),
  });
  if (!res.ok) throw new ReceiptError(res.status === 401 || res.status === 403 ? 'Токен не подходит: нужно право «Models: Read».' : `Ошибка ${res.status}`);
  return true;
}
