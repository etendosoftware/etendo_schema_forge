/**
 * Read-only health checks for the committed Application Dictionary cache.
 *
 * The cache is normally a directory containing one JSON file per SQL
 * statement. Each file contains a `versions` map keyed by query parameters.
 * A legacy flat JSON file is accepted as well so a migration does not turn a
 * cache problem into an unexplained regeneration drift.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const CACHE_STATUS = ['READY', 'MISSING', 'EMPTY', 'INVALID'];

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort((a, b) => a.localeCompare(b))
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function rowsChecksum(rows) {
  return sha256(stableStringify(rows));
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

export function cacheSqlKey(sql) {
  return sha256(normalizeSql(sql));
}

export function cacheParamsKey(params = []) {
  return sha256(stableStringify(params));
}

function refreshAction() {
  return 'Refresh the AD cache with `make regen CACHE_DB=1` (or `make regen ONLY=<spec> CACHE_DB=1`), then rerun `make regen-check FROM_CACHE=1`.';
}

function invalid(reason, file, details) {
  return { file, reason, ...details };
}

function validateVersion(version, file, versionKey) {
  if (!version || typeof version !== 'object' || Array.isArray(version)) {
    return invalid(`version ${versionKey} is not an object`, file);
  }
  if (!Array.isArray(version.params)) {
    return invalid(`version ${versionKey} has no params array`, file);
  }
  if (cacheParamsKey(version.params) !== versionKey) {
    return invalid(`version ${versionKey} key does not match params`, file);
  }
  if (!Array.isArray(version.rows)) {
    return invalid(`version ${versionKey} has no rows array`, file);
  }
  if (version.checksum !== undefined) {
    if (typeof version.checksum !== 'string' || version.checksum.length === 0) {
      return invalid(`version ${versionKey} has an invalid checksum`, file);
    }
    if (version.checksum !== rowsChecksum(version.rows)) {
      return invalid(`version ${versionKey} checksum does not match rows`, file);
    }
  }
  return null;
}

function validateGroupedFile(parsed, file, expectedKey) {
  const problems = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [invalid('file root is not an object', file)];
  }
  if (typeof parsed.sql !== 'string' || normalizeSql(parsed.sql) === '') {
    problems.push(invalid('file has no SQL statement', file));
  } else if (expectedKey && sha256(normalizeSql(parsed.sql)) !== expectedKey) {
    problems.push(invalid('file name does not match the SQL hash', file));
  }
  if (!parsed.versions || typeof parsed.versions !== 'object' || Array.isArray(parsed.versions)) {
    return [...problems, invalid('file has no versions object', file)];
  }
  for (const [versionKey, version] of Object.entries(parsed.versions)) {
    const problem = validateVersion(version, file, versionKey);
    if (problem) problems.push(problem);
  }
  return problems;
}

function validateLegacyEntry(entry, key) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return `entry ${key} is not an object`;
  }
  if (typeof entry.sql !== 'string' || normalizeSql(entry.sql) === '') return `entry ${key} has no SQL statement`;
  if (!Array.isArray(entry.params)) return `entry ${key} has no params array`;
  if (!Array.isArray(entry.rows)) return `entry ${key} has no rows array`;
  if (entry.checksum !== undefined && entry.checksum !== rowsChecksum(entry.rows)) {
    return `entry ${key} checksum does not match rows`;
  }
  return null;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { __parseError: error.message };
  }
}

/**
 * Inspect an AD cache without opening PostgreSQL.
 *
 * @param {string} cachePath directory or legacy `.json` file
 * @returns {{status: string, trustworthy: boolean, path: string, layout: string,
 *   files: number, versions: number, rows: number, invalid: object[], reason: string,
 *   action: string|null}}
 */
export function inspectAdCache(cachePath) {
  const requestedPath = cachePath ? path.resolve(String(cachePath)) : '';
  const result = {
    status: 'MISSING',
    trustworthy: false,
    path: requestedPath,
    layout: 'missing',
    files: 0,
    versions: 0,
    rows: 0,
    invalid: [],
    reason: 'AD cache path does not exist.',
    action: refreshAction(),
  };

  if (!cachePath || !existsSync(requestedPath)) return result;

  let stat;
  try {
    stat = statSync(requestedPath);
  } catch (error) {
    result.status = 'INVALID';
    result.layout = 'unreadable';
    result.reason = `AD cache path cannot be inspected: ${error.message}`;
    result.invalid.push(invalid(result.reason, requestedPath));
    return result;
  }

  if (stat.isFile()) {
    result.layout = 'legacy-file';
    result.files = 1;
    const parsed = readJson(requestedPath);
    if (parsed?.__parseError) {
      result.invalid.push(invalid(`invalid JSON: ${parsed.__parseError}`, requestedPath));
    } else if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      result.invalid.push(invalid('legacy cache root is not an object', requestedPath));
    } else {
      for (const [key, entry] of Object.entries(parsed)) {
        const problem = validateLegacyEntry(entry, key);
        if (problem) result.invalid.push(invalid(problem, requestedPath));
        else {
          result.versions += 1;
          result.rows += entry.rows.length;
        }
      }
    }
  } else if (stat.isDirectory()) {
    result.layout = 'grouped-directory';
    let names;
    try {
      names = readdirSync(requestedPath).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
      result.status = 'INVALID';
      result.reason = `AD cache directory cannot be read: ${error.message}`;
      result.invalid.push(invalid(result.reason, requestedPath));
      return result;
    }
    result.files = names.length;
    for (const name of names) {
      const file = path.join(requestedPath, name);
      const parsed = readJson(file);
      if (parsed?.__parseError) {
        result.invalid.push(invalid(`invalid JSON: ${parsed.__parseError}`, file));
        continue;
      }
      const problems = validateGroupedFile(parsed, file, name.slice(0, -5));
      result.invalid.push(...problems);
      if (parsed?.versions && typeof parsed.versions === 'object' && !Array.isArray(parsed.versions)) {
        for (const version of Object.values(parsed.versions)) {
          if (version && Array.isArray(version.rows)) {
            result.versions += 1;
            result.rows += version.rows.length;
          }
        }
      }
    }
  } else {
    result.layout = 'unsupported';
    result.invalid.push(invalid('AD cache path is neither a file nor a directory', requestedPath));
  }

  if (result.invalid.length > 0) {
    result.status = 'INVALID';
    result.reason = `AD cache has ${result.invalid.length} validation problem(s).`;
  } else if (result.files === 0 || result.versions === 0) {
    result.status = 'EMPTY';
    result.reason = 'AD cache exists but contains no usable query versions.';
  } else {
    result.status = 'READY';
    result.trustworthy = true;
    result.reason = 'AD cache is structurally valid and can be used for offline drift checks.';
    result.action = null;
  }
  return result;
}

export function formatCacheHealth(health) {
  const line = `AD cache: ${health.status} (${health.layout}, ${health.files} file(s), ${health.versions} version(s), ${health.rows} row(s))`;
  if (health.status === 'READY') return `${line}\n  ${health.reason}`;
  const details = health.invalid.slice(0, 3).map((item) => `  - ${item.file}: ${item.reason}`);
  if (health.invalid.length > 3) details.push(`  - +${health.invalid.length - 3} more problem(s)`);
  return [line, `  ${health.reason}`, ...details, `  Action: ${health.action}`].join('\n');
}
