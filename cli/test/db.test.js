import { afterEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closePool,
  createDbPool,
  flushCacheWrites,
  getCacheMode,
  resolveDbDefaults,
  setCacheMode,
  wrapPoolWithCache,
} from '../src/db.js';
import { cacheKey, readCache, writeCache } from '../src/lib/ad-cache.js';

const ENV_KEYS = [
  'ETENDO_DB_HOST',
  'ETENDO_DB_PORT',
  'ETENDO_DB_USER',
  'ETENDO_DB_PASSWORD',
  'ETENDO_DB_NAME',
  'ETENDO_GRADLE_PROPERTIES',
  'SF_CACHE_MODE',
  'SF_CACHE_PATH',
];

const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
}

function withTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'schema-forge-db-test-'));
  return {
    dir,
    path: (...parts) => join(dir, ...parts),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

afterEach(() => {
  setCacheMode({ mode: 'off' });
  restoreEnv();
});

describe('resolveDbDefaults', () => {
  it('uses environment variables when no explicit gradle file is available', () => {
    process.env.ETENDO_DB_HOST = 'db.internal';
    process.env.ETENDO_DB_PORT = '6543';
    process.env.ETENDO_DB_USER = 'admin';
    process.env.ETENDO_DB_PASSWORD = 'secret';
    process.env.ETENDO_DB_NAME = 'erp';

    assert.deepEqual(resolveDbDefaults('/missing/gradle.properties'), {
      host: 'localhost',
      port: 5432,
      user: 'etendo',
      password: '',
      database: 'etendo_dev',
      source: 'defaults',
    });

    assert.deepEqual(resolveDbDefaults(), {
      host: 'db.internal',
      port: 6543,
      user: 'admin',
      password: 'secret',
      database: 'erp',
      source: 'env',
    });
  });

  it('uses explicit gradle.properties ahead of environment variables', () => {
    const tmp = withTempDir();
    try {
      const gradlePath = tmp.path('gradle.properties');
      writeFileSync(
        gradlePath,
        [
          '# comments and blank lines are ignored',
          '',
          'bbdd.url=jdbc:postgresql://db:15432/ignored',
          'bbdd.port=25432',
          'bbdd.user=gradle_user',
          'bbdd.password=gradle_secret',
          'bbdd.sid=gradle_db',
          'line-without-equals',
          '',
        ].join('\n'),
        'utf-8',
      );
      process.env.ETENDO_DB_HOST = 'env-host';
      process.env.ETENDO_DB_PORT = '6543';

      assert.deepEqual(resolveDbDefaults(gradlePath), {
        host: 'localhost',
        port: 25432,
        user: 'gradle_user',
        password: 'gradle_secret',
        database: 'gradle_db',
        source: 'gradle',
      });
    } finally {
      tmp.cleanup();
    }
  });

  it('honors ETENDO_GRADLE_PROPERTIES auto-discovery override', () => {
    const tmp = withTempDir();
    try {
      const gradlePath = tmp.path('gradle.properties');
      writeFileSync(gradlePath, 'bbdd.url=jdbc:postgresql://pg-host:5444/demo\n', 'utf-8');
      process.env.ETENDO_GRADLE_PROPERTIES = gradlePath;

      const defaults = resolveDbDefaults();

      assert.equal(defaults.host, 'pg-host');
      assert.equal(defaults.port, 5444);
      assert.equal(defaults.source, 'gradle');
    } finally {
      tmp.cleanup();
    }
  });
});

describe('cache mode', () => {
  it('validates and reports the active cache mode', () => {
    assert.throws(
      () => setCacheMode({ mode: 'invalid' }),
      /setCacheMode: invalid mode "invalid" \(expected off\|write\|read\)/,
    );

    const tmp = withTempDir();
    try {
      const cachePath = tmp.path('cache.json');
      setCacheMode({ mode: 'read', path: cachePath });
      assert.deepEqual(getCacheMode(), { mode: 'read', path: cachePath });
    } finally {
      tmp.cleanup();
    }
  });

  it('flushCacheWrites is a no-op outside write mode', () => {
    const tmp = withTempDir();
    try {
      const cachePath = tmp.path('cache.json');
      setCacheMode({ mode: 'read', path: cachePath });

      assert.deepEqual(flushCacheWrites(), { written: 0, path: cachePath });
    } finally {
      tmp.cleanup();
    }
  });

  it('wraps pool queries in write mode and merges captured rows into cache', async () => {
    const tmp = withTempDir();
    try {
      const cachePath = tmp.path('cache.json');
      const preservedKey = cacheKey('select preserved', []);
      writeCache(cachePath, {
        [preservedKey]: { sql: 'select preserved', params: [], rows: [{ id: 'old' }] },
      });

      const calls = [];
      const fakePool = {
        async query(sql, params) {
          calls.push({ sql, params });
          return { rows: [{ id: 'fresh' }], rowCount: 1 };
        },
      };

      setCacheMode({ mode: 'write', path: cachePath });
      const wrapped = wrapPoolWithCache(fakePool);
      const result = await wrapped.query(' select   *\nfrom ad_window where id=$1 ', ['W1']);

      assert.deepEqual(result.rows, [{ id: 'fresh' }]);
      assert.deepEqual(calls, [{ sql: ' select   *\nfrom ad_window where id=$1 ', params: ['W1'] }]);

      const flush = flushCacheWrites();
      assert.equal(flush.written, 1);
      assert.equal(flush.path, cachePath);

      const cache = readCache(cachePath);
      assert.deepEqual(cache[preservedKey].rows, [{ id: 'old' }]);
      assert.deepEqual(cache[cacheKey('select * from ad_window where id=$1', ['W1'])], {
        sql: 'select * from ad_window where id=$1',
        params: ['W1'],
        rows: [{ id: 'fresh' }],
      });
    } finally {
      tmp.cleanup();
    }
  });

  it('wraps pool queries in read mode and throws actionable cache miss errors', async () => {
    const tmp = withTempDir();
    try {
      const cachePath = tmp.path('cache.json');
      const sql = 'select * from ad_tab where ad_window_id=$1';
      writeCache(cachePath, {
        [cacheKey(sql, ['W1'])]: { sql, params: ['W1'], rows: [{ id: 'T1' }, { id: 'T2' }] },
      });
      const fakePool = {
        query() {
          throw new Error('real pool should not be used in read mode');
        },
      };

      setCacheMode({ mode: 'read', path: cachePath });
      const wrapped = wrapPoolWithCache(fakePool);
      assert.deepEqual(await wrapped.query(sql, ['W1']), {
        rows: [{ id: 'T1' }, { id: 'T2' }],
        rowCount: 2,
      });

      await assert.rejects(
        () => wrapped.query('select missing from ad_tab where id=$1', ['T3']),
        (err) => {
          assert.equal(err.name, 'CacheMissError');
          assert.equal(err.code, 'AD_CACHE_MISS');
          assert.match(err.message, /Run with CACHE_DB=1 to refresh the cache/);
          assert.match(err.message, /select missing from ad_tab/);
          return true;
        },
      );
    } finally {
      tmp.cleanup();
    }
  });

  it('createDbPool returns a cache-read stub that supports query, connect, and end', async () => {
    const tmp = withTempDir();
    try {
      const cachePath = tmp.path('cache.json');
      const sql = 'select * from ad_field where ad_tab_id=$1';
      writeCache(cachePath, {
        [cacheKey(sql, ['T1'])]: { sql, params: ['T1'], rows: [{ id: 'F1' }] },
      });

      setCacheMode({ mode: 'read', path: cachePath });
      const pool = createDbPool({ host: 'should-not-open-db' });

      assert.equal(pool.__cacheRead, true);
      assert.deepEqual(await pool.query(sql, ['T1']), { rows: [{ id: 'F1' }], rowCount: 1 });

      const client = await pool.connect();
      assert.deepEqual(await client.query(sql, ['T1']), { rows: [{ id: 'F1' }], rowCount: 1 });
      assert.equal(client.release(), undefined);
      assert.equal(await closePool(pool), undefined);
    } finally {
      tmp.cleanup();
    }
  });
});
