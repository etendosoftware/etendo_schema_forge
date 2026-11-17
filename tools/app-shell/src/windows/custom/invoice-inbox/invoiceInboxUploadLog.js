/**
 * ETP-6049 — "Resultado de tus cargas": the documents THIS browser uploaded to the Invoice Inbox,
 * so the page can tell the user what became of them after they navigated away and came back.
 *
 * Plain module (no React, no `@/` imports, `node --test`-able). The record lives OUTSIDE React
 * state on purpose: leaving the page drops the upload queue, but the requests already in flight
 * (up to two) still finish, and their `incomingDocumentId` must be recorded even though the page
 * is gone — so the upload hook calls `appendUploadLog` directly, with the key captured when the
 * files were queued.
 *
 * Storage: `localStorage`, one key per company and account:
 *   `sf:invoice-inbox:uploads:<clientId>:<hash of the account id>`
 * The account id is hashed (FNV-1a, 32-bit hex) so no account identifier is stored in clear
 * (ETP-5202, `lib/sessionIdentity.js`). The value is `{"v":1,"entries":[{"id":"<doc id>","at":<ms>}]}`.
 * Entries expire after 7 days and only the newest 100 are kept. Every access is wrapped in
 * try/catch: with storage blocked (private mode, quota, policy) reads give an empty record and
 * writes do nothing, so the panel simply does not show. Limit (accepted for v1): this browser only.
 */

export const UPLOAD_LOG_PREFIX = 'sf:invoice-inbox:uploads';
export const UPLOAD_LOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const UPLOAD_LOG_MAX_ENTRIES = 100;
const VERSION = 1;

const listeners = new Set();

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** FNV-1a 32-bit of a string, as 8 hex chars. Not a security hash: it only avoids the id in clear. */
export function hashAccountId(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The storage key of a company + account, or null when either is unknown (no record then). */
export function uploadLogKey(clientId, accountId) {
  if (!clientId || !accountId) return null;
  return `${UPLOAD_LOG_PREFIX}:${clientId}:${hashAccountId(accountId)}`;
}

function isEntry(entry) {
  return Boolean(entry) && typeof entry.id === 'string' && entry.id !== '' && Number.isFinite(entry.at);
}

/** Drops expired and malformed entries and keeps the newest `UPLOAD_LOG_MAX_ENTRIES`. */
export function pruneEntries(entries, now = Date.now()) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => isEntry(entry) && now - entry.at < UPLOAD_LOG_TTL_MS)
    .sort((a, b) => a.at - b.at)
    .slice(-UPLOAD_LOG_MAX_ENTRIES);
}

function parse(raw) {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value?.entries) ? value.entries : [];
  } catch {
    return [];
  }
}

/** The live entries of a key, oldest first (empty without a key or with storage unavailable). */
export function readUploadLog(key, now = Date.now()) {
  if (!key) return [];
  try {
    const raw = storage()?.getItem(key);
    return raw ? pruneEntries(parse(raw), now) : [];
  } catch {
    return [];
  }
}

function notify(key) {
  for (const listener of listeners) {
    try {
      listener(key);
    } catch {
      // A listener's failure must not break the others nor the write.
    }
  }
}

function write(key, entries) {
  try {
    const store = storage();
    if (!store) return;
    if (entries.length) store.setItem(key, JSON.stringify({ v: VERSION, entries }));
    else store.removeItem(key);
  } catch {
    // Blocked or full storage: the record is a convenience, the inbox works without it.
  }
  notify(key);
}

/** Records one accepted document (no-op without a key or id; an id already recorded is kept once). */
export function appendUploadLog(key, id, now = Date.now()) {
  if (!key || !id) return;
  const entries = readUploadLog(key, now).filter((entry) => entry.id !== id);
  write(key, pruneEntries([...entries, { id, at: now }], now));
}

/** Removes the given documents from the record ("Entendido"). */
export function removeFromUploadLog(key, ids) {
  if (!key || !ids?.length) return;
  const drop = new Set(ids);
  write(key, readUploadLog(key).filter((entry) => !drop.has(entry.id)));
}

/** Empties the record of a key. */
export function clearUploadLog(key) {
  if (key) write(key, []);
}

/**
 * Subscribes to changes of the record: writes from this tab (direct notification) and from other
 * tabs (the `storage` event). Returns the unsubscribe function.
 *
 * @param {(key: string|null) => void} listener receives the changed key (null when unknown)
 */
export function subscribeUploadLog(listener) {
  listeners.add(listener);
  const onStorage = (event) => {
    if (event.key == null || event.key.startsWith(UPLOAD_LOG_PREFIX)) listener(event.key);
  };
  const target = typeof globalThis.addEventListener === 'function' ? globalThis : null;
  target?.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    target?.removeEventListener('storage', onStorage);
  };
}
