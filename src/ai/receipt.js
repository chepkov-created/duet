// Receipts, on the phone and free.
// 1) The QR code of a Russian receipt holds date, time, total and the fiscal numbers (t=…&s=…&fn=…&i=…&fp=…&n=1),
//    but NOT the list of goods — so the goods are read from the photo text (Tesseract) and split into lines here.

/** Decode the QR code in a photo. Tries a few sizes: receipts are long and the code is small. */
export async function readQR(file) {
  const { default: jsQR } = await import('jsqr');
  const bmp = await createImageBitmap(file);
  for (const max of [1400, 2200, 900]) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height);
    const code = jsQR(img.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (code?.data) return code.data;
  }
  return null;
}

/** "t=20261118T1510&s=1234.56&fn=…&i=…&fp=…&n=1" → { date, amount, type, id } or null if it isn't a receipt code. */
export function parseQR(text) {
  if (!text || !/(^|&)t=\d{8}T\d{4}/.test(text) || !/(^|&)s=/.test(text)) return null;
  const p = Object.fromEntries(text.split('&').map((kv) => kv.split('=')).filter((x) => x.length === 2));
  const m = p.t.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString() : null;
  const amount = Number(String(p.s).replace(',', '.'));
  // n=1 приход (a purchase), n=2 возврат прихода (money back)
  return { date, amount, type: p.n === '2' ? 'income' : 'expense', id: [p.fn, p.i, p.fp].filter(Boolean).join(':') };
}

const SERVICE = /(итог|итого|всего|сумма\s*(ндс|без|по)|ндс|наличн|безнал|электрон|карт[аой]|сдача|получено|кассир|смена|чек\b|кассов|фн\b|фд\b|фп\b|инн|рн\s*ккт|зн\s*ккт|ккт|сайт|фнс|адрес|место\s*расч|приход|возврат|оплат|спасибо|скидк|бонус|баллы|оператор|покупк|система\s*налог|осн\b|усн|www|http|тел\.?|qr)/i;
const MONEY = /(\d{1,3}(?:[  ]\d{3})*|\d+)[.,](\d{2})(?!\d)/g;
const toNum = (s) => Number(String(s).replace(/[  ]/g, '').replace(',', '.'));
const hasWord = (s) => /[a-zа-яё]{3,}/i.test(s);

/**
 * Receipt text → { items: [{ name, qty, price, sum }], total, date, shop }.
 * Handles the usual layouts: "Name" then "2 x 45,00 = 90,00" (or "45,00 * 2"), and "Name ...... 90,00".
 */
export function parseReceiptText(raw) {
  const lines = String(raw || '').split(/\n/).map((l) => l.replace(/[|_]{2,}/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items = [];
  let total = null, date = null, shop = '';
  let pendingName = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const tm = l.match(/(итог[о]?|всего|к\s*оплате)\D{0,12}((\d{1,3}(?:[  ]\d{3})*|\d+)[.,]\d{2})/i);
    if (tm && total === null) { total = toNum(tm[2]); pendingName = ''; continue; }
    const dm = l.match(/(\d{2})[./-](\d{2})[./-](\d{2,4})\D{1,3}(\d{1,2}):(\d{2})/);
    if (dm && !date) { const y = dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]; date = new Date(y, +dm[2] - 1, +dm[1], +dm[4], +dm[5]).toISOString(); }
    if (!shop && i < 6 && /(ооо|ип\b|ао\b|пао|магазин|«|")/i.test(l) && hasWord(l)) shop = l.replace(/^(ооо|пао|ао|ип)\s*/i, '').replace(/[«»"]/g, '').slice(0, 60);
    if (SERVICE.test(l)) { pendingName = ''; continue; }

    // "2 x 45,00 = 90,00" / "2,000 * 45.00 =90.00" / "45,00 x 2"
    const q = l.match(/(\d+(?:[.,]\d{1,3})?)\s*(?:шт\.?|кг|л)?\s*[xх*×]\s*((?:\d{1,3}(?:[  ]\d{3})*|\d+)[.,]\d{2})(?:\s*=?\s*((?:\d{1,3}(?:[  ]\d{3})*|\d+)[.,]\d{2}))?/i);
    if (q) {
      let qty = toNum(q[1]), price = toNum(q[2]);
      // "45,00 x 2": the money comes first
      if (/[.,]\d{2}$/.test(q[1]) && !/[.,]\d{2}$/.test(q[2]) && price < qty) [qty, price] = [price, qty];
      const sum = q[3] ? toNum(q[3]) : Math.round(qty * price * 100) / 100;
      const before = l.slice(0, q.index).replace(/^\d+[.)]\s*/, '').trim();
      const name = (hasWord(before) ? before : pendingName) || 'Товар';
      if (sum > 0 && sum < 1e6) items.push({ name: name.slice(0, 80), qty, price, sum });
      pendingName = '';
      continue;
    }
    // "Молоко 3,2% 1л ..... 89,99" — a name and one sum at the end
    const all = [...l.matchAll(MONEY)];
    const last = all[all.length - 1];
    const name = last ? l.slice(0, last.index).replace(/^\d+[.)]\s*/, '').replace(/[.\s=*]+$/, '').trim() : '';
    if (last && last.index + last[0].length >= l.length - 3 && hasWord(name)) {
      const sum = toNum(last[0]);
      if (sum > 0 && sum < 1e6) items.push({ name: name.slice(0, 80), qty: 1, price: sum, sum });
      pendingName = '';
      continue;
    }
    // a line with only words: probably the name of the next item ("1. Молоко ...")
    if (hasWord(l) && !/\d[.,]\d{2}/.test(l)) pendingName = l.replace(/^\d+[.)]\s*/, '').slice(0, 80);
  }
  return { items, total, date, shop };
}
