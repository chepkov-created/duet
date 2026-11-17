// Ledger file stored in a private GitHub repo through the Contents API.
// Each device reads, merges and writes back with the file sha, retrying on conflicts.

const API = 'https://api.github.com';

const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const headers = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const explain = async (res) => {
  let msg = '';
  try { msg = (await res.json()).message || ''; } catch { /* body not json */ }
  if (res.status === 401) return new GitHubError('Токен GitHub не подходит или истёк', 401);
  if (res.status === 403) return new GitHubError('У токена нет доступа на запись к репозиторию (' + msg + ')', 403);
  if (res.status === 404) return new GitHubError('Репозиторий не найден или токен его не видит', 404);
  return new GitHubError(`GitHub ответил ${res.status}: ${msg}`, res.status);
};

/** @returns {Promise<{data: object|null, sha: string|null}>} */
export async function readLedger({ owner, repo, token, path }) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: headers(token), cache: 'no-store' });
  if (res.status === 404) {
    // Distinguish "file missing" from "repo missing".
    const repoRes = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token), cache: 'no-store' });
    if (!repoRes.ok) throw await explain(repoRes);
    return { data: null, sha: null };
  }
  if (!res.ok) throw await explain(res);
  const meta = await res.json();
  let text;
  if (meta.content) {
    text = b64decode(meta.content);
  } else {
    // Files over 1 MB come without inline content: read the blob instead.
    const blob = await fetch(`${API}/repos/${owner}/${repo}/git/blobs/${meta.sha}`, { headers: headers(token), cache: 'no-store' });
    if (!blob.ok) throw await explain(blob);
    text = b64decode((await blob.json()).content);
  }
  return { data: JSON.parse(text), sha: meta.sha };
}

/** Writes the file; returns the new sha. Throws GitHubError with status 409/422 on sha conflict. */
export async function writeLedger({ owner, repo, token, path }, data, sha, message) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: b64encode(JSON.stringify(data)) }; // compact: the history is thousands of records
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw await explain(res);
  return (await res.json()).content.sha;
}

export async function checkAccess(cfg) {
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, { headers: headers(cfg.token), cache: 'no-store' });
  if (!res.ok) throw await explain(res);
  const repo = await res.json();
  if (!repo.permissions?.push) throw new GitHubError('Токен видит репозиторий, но не может в него писать', 403);
  return { private: repo.private, fullName: repo.full_name };
}
