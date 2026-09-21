import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  cacheSqlKey,
  cacheParamsKey,
  inspectAdCache,
  rowsChecksum,
} from '../src/lib/ad-cache-health.js';

function tempPath() {
  return mkdtempSync(path.join(tmpdir(), 'sf-cache-health-'));
}

function writeGrouped(dir, sql, params = [], rows = [{ id: '1' }], checksum = rowsChecksum(rows)) {
  const sqlKey = cacheSqlKey(sql);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${sqlKey}.json`), JSON.stringify({
    sql,
    versions: {
      [cacheParamsKey(params)]: { params, checksum, rows },
    },
  }));
}

describe('AD cache health', () => {
  it('reports a missing cache and gives the refresh action', () => {
    const health = inspectAdCache(path.join(tempPath(), 'missing'));
    assert.equal(health.status, 'MISSING');
    assert.equal(health.trustworthy, false);
    assert.match(health.action, /CACHE_DB=1/);
  });

  it('accepts the grouped directory format and counts versions and rows', () => {
    const dir = path.join(tempPath(), 'ad-snapshot');
    writeGrouped(dir, 'SELECT * FROM AD_Window WHERE AD_Window_ID = $1', ['W1'], [{ id: '1' }, { id: '2' }]);
    const health = inspectAdCache(dir);
    assert.deepEqual({
      status: health.status,
      layout: health.layout,
      files: health.files,
      versions: health.versions,
      rows: health.rows,
      trustworthy: health.trustworthy,
    }, {
      status: 'READY',
      layout: 'grouped-directory',
      files: 1,
      versions: 1,
      rows: 2,
      trustworthy: true,
    });
  });

  it('rejects malformed JSON before any drift comparison can run', () => {
    const dir = path.join(tempPath(), 'ad-snapshot');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'broken.json'), '{not-json');
    const health = inspectAdCache(dir);
    assert.equal(health.status, 'INVALID');
    assert.equal(health.trustworthy, false);
    assert.match(health.invalid[0].reason, /invalid JSON/);
  });

  it('rejects a checksum mismatch as an invalid snapshot', () => {
    const dir = path.join(tempPath(), 'ad-snapshot');
    writeGrouped(dir, 'SELECT 1', [], [{ id: 'fresh' }], rowsChecksum([{ id: 'old' }]));
    const health = inspectAdCache(dir);
    assert.equal(health.status, 'INVALID');
    assert.match(health.invalid[0].reason, /checksum does not match rows/);
  });

  it('accepts the legacy flat JSON format during migration', () => {
    const file = path.join(tempPath(), 'ad-snapshot.json');
    writeFileSync(file, JSON.stringify({
      query: { sql: 'SELECT 1', params: [], rows: [] },
    }));
    const health = inspectAdCache(file);
    assert.equal(health.status, 'READY');
    assert.equal(health.layout, 'legacy-file');
    assert.equal(health.versions, 1);
  });
});
