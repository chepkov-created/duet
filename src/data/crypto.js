// Each person's own key, so a «Секрет» is really secret: it is encrypted on the author's phone before it goes
// into the shared file. The other phone (and anyone reading the file on GitHub) sees only an unreadable blob.
//
// - Every person has a random data key (AES-GCM 256). It lives on their phone (localStorage).
// - The same key is stored in the shared file in `profiles`, locked with the person's PIN (PBKDF2 → AES-GCM),
//   so a new or reset phone gets it back with the PIN. The PIN also protects «Я —» from being switched.
// - A secret record on the wire: { id, updatedAt, by, owner, secretFrom, secretOwner, enc } — nothing else.

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const KEY_STORE = 'duet.key';
const ITER = 210000;
const PIN_CHECK = 'duet-pin-ok';

const subtle = () => globalThis.crypto?.subtle;

async function pinKey(pin, salt) {
  const base = await subtle().importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, bytes);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0); out.set(new Uint8Array(ct), 12);
  return b64(out);
}
async function open(key, text) {
  const all = unb64(text);
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12)));
}
const importData = (raw) => subtle().importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);

/* ---------- this phone's key ---------- */
let cached = null; // { person, key }
export function storedKeyFor(person) {
  try { const j = JSON.parse(localStorage.getItem(KEY_STORE) || 'null'); return j && j.person === person ? j.raw : null; } catch { return null; }
}
export async function myKey(person) {
  if (cached && cached.person === person) return cached.key;
  const raw = storedKeyFor(person);
  if (!raw || !subtle()) return null;
  cached = { person, key: await importData(unb64(raw)) };
  return cached.key;
}
function rememberKey(person, rawBytes) {
  try { localStorage.setItem(KEY_STORE, JSON.stringify({ person, raw: b64(rawBytes) })); } catch { /* storage blocked */ }
  cached = null;
}
export function forgetKey() { try { localStorage.removeItem(KEY_STORE); } catch { /* */ } cached = null; }

/* ---------- PIN ---------- */
/** New PIN for a person (also when changing it): the data key stays the same, only its lock changes. */
export async function makeProfile(person, pin) {
  const old = storedKeyFor(person);
  const raw = old ? unb64(old) : crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await pinKey(pin, salt);
  const profile = { id: person, salt: b64(salt), check: await seal(k, enc.encode(PIN_CHECK)), wrapped: await seal(k, raw), iter: ITER };
  rememberKey(person, raw);
  return profile;
}

/** Right PIN → the key is put on this phone and true is returned; wrong PIN → false. */
export async function unlockProfile(profile, pin) {
  try {
    const k = await pinKey(pin, unb64(profile.salt));
    if (dec.decode(await open(k, profile.check)) !== PIN_CHECK) return false;
    rememberKey(profile.id, await open(k, profile.wrapped));
    return true;
  } catch { return false; }
}

/* ---------- records ---------- */
const PUBLIC = ['id', 'updatedAt', 'by', 'owner', 'secretFrom', 'secretOwner', 'deleted'];
export const isLocked = (r) => Boolean(r.enc && !r.type);

/** For the shared file: secrets written on this phone become a sealed blob (unchanged ones reuse their old blob). */
export async function sealMine(records, me) {
  const key = await myKey(me);
  if (!key) return records;
  return Promise.all(records.map(async (r) => {
    if (r.deleted || !r.secretFrom || r.secretFrom === me || isLocked(r)) return r;
    if ((r.secretOwner || me) !== me) return r;
    if (r.enc && r.encAt === r.updatedAt) return pick(r, r.enc);
    const { enc: _e, encAt: _a, ...plain } = r;
    return pick({ ...plain, secretOwner: me }, await seal(key, enc.encode(JSON.stringify(plain))));
  }));
}
const pick = (r, blob) => Object.fromEntries([...PUBLIC.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]), ['secretOwner', r.secretOwner], ['enc', blob]]);

/** After reading the shared file: open my own sealed secrets; the other person's stay locked (and are not shown). */
export async function openMine(records, me) {
  if (!records.some((r) => isLocked(r) && r.secretOwner === me)) return records;
  const key = await myKey(me);
  if (!key) return records;
  return Promise.all(records.map(async (r) => {
    if (!isLocked(r) || r.secretOwner !== me) return r;
    try {
      const plain = JSON.parse(dec.decode(await open(key, r.enc)));
      return { ...plain, id: r.id, updatedAt: r.updatedAt, by: r.by, secretOwner: me, enc: r.enc, encAt: r.updatedAt };
    } catch { return r; }
  }));
}
