/**
 * ad-cache.js — Generic key-value cache for AD (Application Dictionary) snapshots.
 *
 * This module is intentionally agnostic of SQL, DB drivers, and business logic.
 * It exposes:
 *   - cacheKey(sql, params)  → deterministic string key
 *   - readCache(path)        → parsed cache object ({} if missing)
 *   - writeCache(path, obj)  → pretty JSON with sorted keys (deterministic diffs)
 *   - mergeCache(existing, fresh) → fresh entries overwrite, others preserved
 *
 * Cache file shape:
 *   {
 *     "<deterministic-key>": { sql: "...", params: [...], rows: [...] },
 *     ...
 *   }
 *
 * Slice 1 uses this from db.js to wrap pg.Pool.query().
 * Slice 2 will reuse it from push-to-neo's delta dump.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Normalize whitespace in a SQL string so that semantically identical
 * queries with different formatting yield the same cache key.
 *   - Collapses any whitespace run (spaces, tabs, newlines) to a single space.
 *   - Trims leading/trailing whitespace.
 */
function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

/**
 * Deterministic JSON.stringify with sorted object keys at every depth.
 * Arrays preserve their order (param order matters for SQL placeholders).
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/**
 * Compute a deterministic cache key for a (sql, params) pair.
 * Different whitespace → same key. Different param order within an object
 * (e.g. `{a:1,b:2}` vs `{b:2,a:1}`) → same key. Different param ORDER in
 * an array (positional $1, $2 placeholders) → different key, as it should.
 */
export function cacheKey(sql, params = []) {
  const payload = stableStringify({ sql: normalizeSql(sql), params });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Read a cache file. Returns {} if the file does not exist or is empty.
 * Parse errors are NOT swallowed — they surface as exceptions so a corrupt
 * cache is loud, not silent.
 */
export function readCache(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

/**
 * Write a cache object to disk with deterministic key ordering and
 * pretty-printed JSON (2-space indent) so diffs are reviewable.
 * Ensures the parent directory exists.
 */
export function writeCache(path, entries) {
  const sorted = {};
  for (const k of Object.keys(entries).sort((a, b) => a.localeCompare(b))) {
    sorted[k] = entries[k];
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

/**
 * Merge two cache objects. Entries present in `fresh` overwrite entries
 * with the same key in `existing`; all other `existing` entries are kept.
 */
export function mergeCache(existing, fresh) {
  return { ...existing, ...fresh };
}
