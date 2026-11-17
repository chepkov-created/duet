import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES } from '../data/categories.js';

// Shrinks a screenshot so long phone captures stay readable but cheap.
export async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const maxSide = 2000;
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { media_type: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['transactions'],
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'amount', 'date', 'time', 'payee', 'description', 'categoryId', 'confidence'],
        properties: {
          type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
          amount: { type: 'number', description: 'Positive amount in rubles' },
          date: { type: 'string', description: 'YYYY-MM-DD, or empty string if not visible' },
          time: { type: 'string', description: 'HH:MM, or empty string if not visible' },
          payee: { type: 'string', description: 'Merchant or counterparty as shown' },
          description: { type: 'string', description: 'Short note in Russian, may be empty' },
          categoryId: { type: 'string', description: 'One id from the category list' },
          confidence: { type: 'string', enum: ['high', 'low'] },
        },
      },
    },
  },
};

const categoryList = CATEGORIES.map((c) => `${c.id} — ${c.name}${c.id.endsWith('.0') ? ' (общая)' : ''} [${c.type === 'income' ? 'доход' : 'расход'}]`).join('\n');

const SYSTEM = `Ты разбираешь скриншоты из банковских приложений (Сбер, Т-Банк, ПСБ, Альфа и другие) и выписываешь каждую операцию.
Правила:
- Одна строка операции на скриншоте = одна транзакция. Не выдумывай операции, которых не видно.
- Сумму пиши положительным числом в рублях (знак определяй через type). Списание = expense, зачисление = income, перевод между своими счетами = transfer.
- Перевод человеку (по номеру телефона, СБП) считай expense, а входящий перевод от человека — income, если не ясно, что это свои счета.
- Дату бери из заголовков групп ("Сегодня", "Вчера", "16 ноября") относительно сегодняшней даты. Если даты нет — пустая строка.
- Пропускай отклонённые и отменённые операции, а также итоговые суммы и баланс счёта.
- categoryId выбирай строго из списка. Если подходит только группа — бери её общую категорию (id с .0). Если не уверен — confidence "low".

Категории:
${categoryList}`;

/**
 * @param {{key: string, model: string, images: {media_type: string, data: string}[], today: Date}} opts
 * @returns {Promise<Array>} parsed transactions
 */
export async function recognize({ key, model, images, today = new Date() }) {
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const content = [
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } })),
    { type: 'text', text: `Сегодня ${today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Выпиши все операции со скриншотов.` },
  ];
  const usesFallback = /^claude-(opus-5-5|fable-5-2|fable-5-1|opus-5|sonnet-5-5)$/.test(model);

  let response;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      ...(usesFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Ключ Anthropic не подходит. Проверьте его в настройках.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('У ключа нет доступа к этой модели.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Слишком много запросов. Подождите минуту и попробуйте снова.');
    if (e instanceof Anthropic.BadRequestError) throw new Error('Запрос отклонён: ' + (e.error?.error?.message || e.message));
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Нет связи с сервером распознавания. Проверьте интернет.');
    throw e;
  }

  if (response.stop_reason === 'refusal') throw new Error('Модель отказалась разбирать это изображение.');
  if (response.stop_reason === 'max_tokens') throw new Error('Слишком много операций за раз. Загрузите меньше скриншотов.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Не удалось разобрать ответ модели.'); }
  const valid = new Set(CATEGORIES.map((c) => c.id));
  return (parsed.transactions || [])
    .filter((t) => t.amount > 0)
    .map((t) => ({ ...t, categoryId: valid.has(t.categoryId) ? t.categoryId : t.type === 'income' ? 'inc.0' : 'other.0' }));
}
