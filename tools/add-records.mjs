// Adds records to the shared ledger in the private duet-data repo.
// Used from the chat: screenshots are read by Claude, the records land here,
// and both phones pick them up on their next sync.
//
//   node tools/add-records.mjs records.json [--dry]
//
// records.json: [{ type, amount, accountId, categoryId, date, owner, payee?, note?, toAccountId?, toAmount? }]
// date: "2026-11-17" or "2026-11-17 14:30" (local time)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../src/data/categories.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_URL = 'https://github.com/chepkov-created/duet-data.git';
const LOCAL = resolve(here, '..', '..', 'duet-data');
const FILE = 'ledger.json';
const PEOPLE = ['Миша', 'Арина'];

const git = (...args) => execFileSync('git', ['-C', LOCAL, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

const [inputPath, flag] = process.argv.slice(2);
if (!inputPath) { console.error('usage: node tools/add-records.mjs records.json [--dry]'); process.exit(1); }
const input = JSON.parse(readFileSync(inputPath, 'utf8'));

if (!existsSync(join(LOCAL, '.git'))) execFileSync('git', ['clone', '-q', REPO_URL, LOCAL], { stdio: 'inherit' });

function apply(ledger) {
  const accounts = new Map(ledger.accounts.filter((a) => !a.deleted).map((a) => [a.id, a]));
  const cats = new Set(CATEGORIES.map((c) => c.id));
  const now = Date.now();
  const added = [], skipped = [];
  for (const [i, r] of input.entries()) {
    const where = `#${i + 1} ${r.payee || ''} ${r.amount}`;
    if (!['expense', 'income', 'transfer'].includes(r.type)) throw new Error(`${where}: type`);
    if (!(r.amount > 0)) throw new Error(`${where}: amount`);
    if (!accounts.has(r.accountId)) throw new Error(`${where}: нет счёта ${r.accountId}`);
    if (r.type === 'transfer' && !accounts.has(r.toAccountId)) throw new Error(`${where}: нет счёта ${r.toAccountId}`);
    if (r.type !== 'transfer' && !cats.has(r.categoryId)) throw new Error(`${where}: нет категории ${r.categoryId}`);
    if (!PEOPLE.includes(r.owner)) throw new Error(`${where}: owner`);
    const [d, t = '12:00'] = String(r.date).split(/[ T]/);
    const [y, m, dd] = d.split('-').map(Number);
    const [hh, mi] = t.split(':').map(Number);
    const date = new Date(y, m - 1, dd, hh, mi).toISOString();
    const dup = ledger.records.find((x) => !x.deleted && x.type === r.type && x.accountId === r.accountId && Math.abs(x.amount - r.amount) < 0.005 && dayKey(x.date) === dayKey(date));
    if (dup && !r.force) { skipped.push(`${where} (уже есть)`); continue; }
    const rec = {
      id: uid(), type: r.type, amount: r.amount, accountId: r.accountId, categoryId: r.type === 'transfer' ? '' : r.categoryId,
      date, owner: r.owner, payee: r.payee || '', note: r.note || '', labels: r.labels || [], payment: 'Карта', status: 'done',
      source: 'чат', by: 'Claude (чат)', updatedAt: now,
    };
    if (r.type === 'transfer') { rec.toAccountId = r.toAccountId; if (r.toAmount) rec.toAmount = r.toAmount; }
    ledger.records.push(rec);
    added.push(rec);
  }
  return { added, skipped };
}

for (let attempt = 0; attempt < 4; attempt++) {
  git('fetch', '-q', 'origin');
  git('reset', '-q', '--hard', 'origin/HEAD');
  const path = join(LOCAL, FILE);
  if (!existsSync(path)) { console.error('В duet-data ещё нет ledger.json: сначала подключите синхронизацию на телефоне.'); process.exit(2); }
  const ledger = JSON.parse(readFileSync(path, 'utf8'));
  const { added, skipped } = apply(ledger);
  for (const s of skipped) console.log('пропущено', s);
  if (!added.length) { console.log('Добавлять нечего.'); process.exit(0); }
  const sum = added.reduce((a, r) => a + (r.type === 'income' ? r.amount : r.type === 'expense' ? -r.amount : 0), 0);
  for (const r of added) console.log('+', r.type, r.amount, r.accountId, r.categoryId, r.owner, r.payee);
  if (flag === '--dry') { console.log(`(проверка) ${added.length} записей, итого ${sum.toFixed(2)}`); process.exit(0); }
  writeFileSync(path, JSON.stringify(ledger, null, 1));
  git('add', FILE);
  git('-c', 'user.name=chepkov-created', '-c', 'user.email=chepkov-created@users.noreply.github.com', 'commit', '-q', '-m', `Из чата: ${added.length} записей`);
  try {
    git('push', '-q', 'origin', 'HEAD');
    console.log(`Готово: добавлено ${added.length}, итого ${sum.toFixed(2)} ₽`);
    process.exit(0);
  } catch {
    console.log('Файл изменился на телефоне, повторяю…');
  }
}
console.error('Не удалось записать после нескольких попыток.');
process.exit(3);
