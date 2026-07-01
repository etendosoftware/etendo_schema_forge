import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheKey, readCache, writeCache, mergeCache } from './lib/ad-cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Global, repo-wide AD query cache. Single source of truth so that all
 * three extractors (extract-from-db, extract-fields, extract-rules) share
 * the same file and one CACHE_DB=1 refresh covers all of them.
 */
export const DEFAULT_CACHE_PATH = join(__dirname, '..', 'cache', 'ad-snapshot.json');

/**
 * Module-level cache mode. Set by setCacheMode() before any createDbPool()
 * call. The pool returned by createDbPool() reads this state and either
 * (a) records every query into a buffer flushed by flushCacheWrites(), or
 * (b) serves results from the cache file and throws on miss.
 *
 * Modes:
 *   - 'off'       → no cache interaction (current default behavior).
 *   - 'write'     → run against DB, record (sql, params, rows) for later flush.
 *   - 'read'      → never open DB; resolve from cache or throw with refresh hint.
 */
// Honor SF_CACHE_MODE env var at module load. Lets the Makefile (or a parent
// process) opt the entire chain into cache read/write without every CLI
// knowing the flag. setCacheMode() calls still override this.
function initialCacheModeFromEnv() {
  const v = process.env.SF_CACHE_MODE;
  return (v === 'read' || v === 'write' || v === 'off') ? v : 'off';
}

let cacheMode = initialCacheModeFromEnv();
let cachePath = process.env.SF_CACHE_PATH || DEFAULT_CACHE_PATH;
let writeBuffer = {};   // accumulates fresh entries during a 'write' run
let readSnapshot = null; // lazily loaded cache for 'read' mode

/**
 * Configure cache behavior for the rest of the process. Must be called
 * BEFORE createDbPool(). Pass mode='off' to reset.
 */
export function setCacheMode({ mode = 'off', path } = {}) {
  if (!['off', 'write', 'read'].includes(mode)) {
    throw new Error(`setCacheMode: invalid mode "${mode}" (expected off|write|read)`);
  }
  cacheMode = mode;
  cachePath = path || DEFAULT_CACHE_PATH;
  writeBuffer = {};
  readSnapshot = null;
}

export function getCacheMode() {
  return { mode: cacheMode, path: cachePath };
}

/**
 * Persist any queries recorded during 'write' mode into the on-disk cache.
 * Existing entries are preserved; entries with the same (sql, params) key
 * captured during this run overwrite the stale ones. No-op outside 'write'.
 *
 * Call this once at the end of an extraction run (after closePool).
 */
export function flushCacheWrites() {
  if (cacheMode !== 'write') return { written: 0, path: cachePath };
  const existing = readCache(cachePath);
  const merged = mergeCache(existing, writeBuffer);
  writeCache(cachePath, merged);
  const written = Object.keys(writeBuffer).length;
  writeBuffer = {};
  return { written, path: cachePath };
}

class CacheMissError extends Error {
  constructor(key, sql, params) {
    super(
      `AD cache miss for query.\n` +
      `  key:    ${key}\n` +
      `  sql:    ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 200)}\n` +
      `  params: ${JSON.stringify(params)}\n` +
      `Run with CACHE_DB=1 to refresh the cache for this window.`
    );
    this.name = 'CacheMissError';
    this.code = 'AD_CACHE_MISS';
  }
}

/**
 * Wrap a pg.Pool so that .query() honors the active cacheMode.
 *   - 'off'   → passthrough to the real pool.
 *   - 'write' → run the real query, store result in writeBuffer, return as-is.
 *   - 'read'  → look up in readSnapshot, return a pg-shaped { rows } object,
 *               throw CacheMissError if absent.
 */
export function wrapPoolWithCache(realPool) {
  const originalQuery = realPool.query.bind(realPool);

  realPool.query = async function cachedQuery(sql, params = []) {
    // pg.Pool.query supports many signatures. We only need to handle
    // (sql, paramsArray) — the only form used by Schema Forge extractors.
    const key = cacheKey(sql, params);

    if (cacheMode === 'write') {
      const result = await originalQuery(sql, params);
      writeBuffer[key] = {
        sql: String(sql).replace(/\s+/g, ' ').trim(),
        params,
        rows: result.rows,
      };
      return result;
    }

    if (cacheMode === 'read') {
      if (readSnapshot === null) readSnapshot = readCache(cachePath);
      const entry = readSnapshot[key];
      if (!entry) throw new CacheMissError(key, sql, params);
      return { rows: entry.rows, rowCount: entry.rows.length };
    }

    return originalQuery(sql, params);
  };

  return realPool;
}

/**
 * Stub pool used in 'read' mode. Never opens a real connection. Its
 * .query() resolves from the cache (or throws). .end() is a no-op.
 */
function createCacheReadPool() {
  const pool = {
    async query(sql, params = []) {
      const key = cacheKey(sql, params);
      if (readSnapshot === null) readSnapshot = readCache(cachePath);
      const entry = readSnapshot[key];
      if (!entry) throw new CacheMissError(key, sql, params);
      return { rows: entry.rows, rowCount: entry.rows.length };
    },
    async end() { /* no-op */ },
    __cacheRead: true,
  };
  return pool;
}

/**
 * Parse a gradle.properties file into a key-value object.
 * Skips comments (#) and empty lines.
 */
function parseGradleProperties(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const props = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    props[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return props;
}

/**
 * Resolve DB config from (in priority order):
 * 1. Explicit config object passed as argument
 * 2. Explicit gradle.properties path passed as argument
 * 3. gradle.properties file (auto-discovered or via ETENDO_GRADLE_PROPERTIES env var)
 * 4. Environment variables (ETENDO_DB_HOST, etc.)
 *
 * @param {object} [config] - Explicit DB config (host, port, user, password, database)
 * @param {string} [gradlePropertiesPath] - Path to gradle.properties. When provided,
 * it is used ahead of env vars and a missing file falls back to defaults.
 */
function loadGradleConfig(gradlePropertiesPath) {
  if (gradlePropertiesPath) {
    try {
      return { gradle: parseGradleProperties(gradlePropertiesPath), explicit: true };
    } catch {
      return { gradle: null, explicit: true };
    }
  }

  const gradlePath = process.env.ETENDO_GRADLE_PROPERTIES || findGradleProperties();
  if (!gradlePath) return { gradle: null, explicit: false };
  try {
    return { gradle: parseGradleProperties(gradlePath), explicit: false };
  } catch {
    // File not found or unreadable — caller falls through to env vars / defaults
    return { gradle: null, explicit: false };
  }
}

function extractGradleHostPort(gradle) {
  if (!gradle) return { host: null, port: null };
  let host = null;
  let port = null;
  if (gradle['bbdd.url']) {
    const urlMatch = gradle['bbdd.url'].match(/postgresql:\/\/([^:/]+)(?::(\d+))?/);
    if (urlMatch) {
      host = urlMatch[1];
      if (urlMatch[2]) port = parseInt(urlMatch[2], 10);
    }
  }
  // bbdd.port overrides URL port if present
  if (gradle['bbdd.port']) {
    port = parseInt(gradle['bbdd.port'], 10);
  }
  return { host, port };
}

/**
 * Resolve the default DB connection values from gradle.properties (or env vars)
 * without opening a pool. Used by the interactive TUI to pre-fill prompts.
 * Returns { host, port, user, password, database, source } where source is
 * 'gradle' | 'env' | 'defaults'.
 */
export function resolveDbDefaults(gradlePropertiesPath) {
  const { gradle, explicit } = loadGradleConfig(gradlePropertiesPath);
  const { host: gradleHost, port: gradlePort } = extractGradleHostPort(gradle);
  const envHost = explicit ? null : process.env.ETENDO_DB_HOST;
  const envPort = explicit ? null : parseInt(process.env.ETENDO_DB_PORT, 10);
  const envUser = explicit ? null : process.env.ETENDO_DB_USER;
  const envPassword = explicit ? null : process.env.ETENDO_DB_PASSWORD;
  const envDatabase = explicit ? null : process.env.ETENDO_DB_NAME;

  let source = 'defaults';
  if (gradle) {
    source = 'gradle';
  } else if (envHost) {
    source = 'env';
  }
  return {
    host: (gradleHost === 'db' ? 'localhost' : gradleHost) || envHost || 'localhost',
    port: gradlePort || envPort || 5432,
    user: gradle?.['bbdd.user'] || envUser || 'etendo',
    password: gradle?.['bbdd.password'] || envPassword || '',
    database: gradle?.['bbdd.sid'] || envDatabase || 'etendo_dev',
    source,
  };
}

export function createDbPool(config, gradlePropertiesPath) {
  // 'read' mode never opens a real connection — return the stub pool.
  if (cacheMode === 'read') {
    return createCacheReadPool();
  }

  if (config && config.host) {
    const pool = new pg.Pool(config);
    return cacheMode === 'write' ? wrapPoolWithCache(pool) : pool;
  }

  const { gradle, explicit } = loadGradleConfig(gradlePropertiesPath);
  const { host: gradleHost, port: gradlePort } = extractGradleHostPort(gradle);
  const envHost = explicit ? null : process.env.ETENDO_DB_HOST;
  const envPort = explicit ? null : parseInt(process.env.ETENDO_DB_PORT, 10);
  const envUser = explicit ? null : process.env.ETENDO_DB_USER;
  const envPassword = explicit ? null : process.env.ETENDO_DB_PASSWORD;
  const envDatabase = explicit ? null : process.env.ETENDO_DB_NAME;

  const pool = new pg.Pool({
    host: (gradleHost === 'db' ? 'localhost' : gradleHost) || envHost || 'localhost',
    port: gradlePort || envPort || 5432,
    user: gradle?.['bbdd.user'] || envUser || 'etendo',
    password: gradle?.['bbdd.password'] || envPassword || '',
    database: gradle?.['bbdd.sid'] || envDatabase || 'etendo_dev',
    max: 5,
  });
  return cacheMode === 'write' ? wrapPoolWithCache(pool) : pool;
}

/**
 * Auto-discover gradle.properties by walking up from the CLI source dir.
 * Schema Forge lives at {etendo_root}/schema_forge/cli/src/db.js
 * so gradle.properties is at ../../.. relative to this file.
 */
function findGradleProperties() {
  // Try: schema_forge/../gradle.properties (etendo root)
  const candidate = join(__dirname, '..', '..', '..', 'gradle.properties');
  try {
    readFileSync(candidate, 'utf-8');
    return candidate;
  } catch {
    return null;
  }
}

export async function closePool(pool) {
  await pool.end();
}
