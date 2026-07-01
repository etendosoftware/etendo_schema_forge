import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkMatchings,
  printSummary,
  validateFieldNames,
} from '../src/validate-field-names.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const ARTIFACTS = resolve(ROOT, 'artifacts');

// Unique, deterministic temp spec dir under the real artifacts/ (contract path is hardcoded).
const TEST_SPEC = '.__test-vfn-fixture';
const TEST_SPEC_DIR = resolve(ARTIFACTS, TEST_SPEC);
const CONTRACT_PATH = resolve(TEST_SPEC_DIR, 'contract.json');

const MISSING_SPEC = '__test-vfn-nonexistent';

// ---------------------------------------------------------------------------

describe('checkMatchings', () => {
  it('classifies an exact match as matched', () => {
    const result = checkMatchings(['documentNo'], new Set(['documentNo']), ['documentNo']);
    assert.deepEqual(result, { matched: ['documentNo'], missing: [], mismatched: [] });
  });

  it('classifies a case-insensitive-only match as mismatched', () => {
    const result = checkMatchings(['documentNo'], new Set(['DocumentNo']), ['DocumentNo']);
    assert.deepEqual(result.matched, []);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.mismatched, [{ contract: 'documentNo', api: 'DocumentNo' }]);
  });

  it('classifies a key with no match as missing', () => {
    const result = checkMatchings(['orphan'], new Set(['other']), ['other']);
    assert.deepEqual(result.matched, []);
    assert.deepEqual(result.mismatched, []);
    assert.deepEqual(result.missing, ['orphan']);
  });

  it('handles a mix of matched, mismatched and missing', () => {
    const contractFields = ['a', 'b', 'c'];
    const apiKeys = ['a', 'B', 'x'];
    const result = checkMatchings(contractFields, new Set(apiKeys), apiKeys);
    assert.deepEqual(result.matched, ['a']);
    assert.deepEqual(result.mismatched, [{ contract: 'b', api: 'B' }]);
    assert.deepEqual(result.missing, ['c']);
  });

  it('returns all-empty for empty input', () => {
    const result = checkMatchings([], new Set(), []);
    assert.deepEqual(result, { matched: [], missing: [], mismatched: [] });
  });
});

// ---------------------------------------------------------------------------

describe('printSummary', () => {
  let logs;
  let warns;
  let originalLog;
  let originalWarn;

  beforeEach(() => {
    logs = [];
    warns = [];
    originalLog = console.log;
    originalWarn = console.warn;
    console.log = (...a) => logs.push(a.join(' '));
    console.warn = (...a) => warns.push(a.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
  });

  it('logs the reason and returns early when skipped', () => {
    printSummary({ skipped: true, reason: 'No data in entity' }, 'sales-order');
    assert.equal(logs.length, 1);
    assert.match(logs[0], /\[F7b\] Field name validation skipped: No data in entity/);
    assert.equal(warns.length, 0);
  });

  it('logs header and matched count for a non-skipped clean result', () => {
    printSummary(
      { skipped: false, matched: ['a', 'b'], mismatched: [], missing: [], extra: [] },
      'sales-order',
    );
    assert.match(logs[0], /\[F7b\] Field name validation for 'sales-order':/);
    assert.match(logs[1], /Matched: 2/);
    // No optional blocks emitted
    assert.equal(logs.length, 2);
    assert.equal(warns.length, 0);
  });

  it('logs the mismatched block with per-item lines', () => {
    printSummary(
      {
        skipped: false,
        matched: [],
        mismatched: [{ contract: 'documentNo', api: 'DocumentNo' }],
        missing: [],
        extra: [],
      },
      'w',
    );
    assert.ok(warns.some(l => /Mismatched \(case difference\): 1/.test(l)));
    assert.ok(warns.some(l => /documentNo -> API returns: DocumentNo/.test(l)));
  });

  it('logs the missing block with per-item lines', () => {
    printSummary(
      { skipped: false, matched: [], mismatched: [], missing: ['orphan'], extra: [] },
      'w',
    );
    assert.ok(warns.some(l => /Missing from API: 1/.test(l)));
    assert.ok(warns.some(l => /^\s+orphan$/.test(l)));
  });

  it('logs the extra block with per-item lines', () => {
    printSummary(
      { skipped: false, matched: [], mismatched: [], missing: [], extra: ['surprise'] },
      'w',
    );
    assert.ok(logs.some(l => /Extra in API \(not in contract\): 1/.test(l)));
    assert.ok(logs.some(l => /^\s+surprise$/.test(l)));
  });

  it('skips zero-length optional blocks', () => {
    printSummary(
      { skipped: false, matched: ['a'], mismatched: [], missing: [], extra: [] },
      'w',
    );
    assert.ok(!logs.some(l => /Extra in API/.test(l)));
    assert.equal(warns.length, 0);
  });
});

// ---------------------------------------------------------------------------

describe('validateFieldNames', () => {
  let originalFetch;

  function writeContract(obj) {
    return writeFile(CONTRACT_PATH, JSON.stringify(obj), 'utf8');
  }

  // A standard valid contract with two visible fields, one system + one discarded
  // (which must be filtered out of contractFields).
  function validContract() {
    return {
      frontendContract: {
        window: { primaryEntity: 'header' },
        entities: {
          header: {
            fields: [
              { name: 'documentNo' },
              { name: 'partnerName', apiKey: 'businessPartner' },
              { name: 'sysField', visibility: 'system' },
              { name: 'discardedField', visibility: 'discarded' },
            ],
          },
        },
      },
    };
  }

  before(async () => {
    await mkdir(TEST_SPEC_DIR, { recursive: true });
    originalFetch = globalThis.fetch;
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await rm(TEST_SPEC_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Default stub fails loudly if a test forgets to override it; individual
    // tests that need fetch set their own stub.
    globalThis.fetch = async () => {
      throw new Error('fetch not stubbed');
    };
    delete process.env.NEO_TOKEN;
    delete process.env.ETENDO_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.NEO_TOKEN;
    delete process.env.ETENDO_URL;
  });

  it('skips when the contract cannot be read', async () => {
    const result = await validateFieldNames(MISSING_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.match(result.reason, /^Cannot read contract:/);
  });

  it('skips when there is no frontendContract.window', async () => {
    await writeContract({ frontendContract: {} });
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'No frontendContract.window in contract');
  });

  it('skips when there is no primaryEntity', async () => {
    await writeContract({ frontendContract: { window: {} } });
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'No primaryEntity in contract window');
  });

  it('skips when the primary entity is missing', async () => {
    await writeContract({
      frontendContract: { window: { primaryEntity: 'header' }, entities: {} },
    });
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.match(result.reason, /No fields found for entity 'header'/);
  });

  it('skips when the primary entity has empty fields', async () => {
    await writeContract({
      frontendContract: {
        window: { primaryEntity: 'header' },
        entities: { header: { fields: [] } },
      },
    });
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.match(result.reason, /No fields found for entity 'header'/);
  });

  it('uses NEO_TOKEN from the environment to bypass the token script', async () => {
    // Verifies the env-token branch of the token resolution chain
    // (opts.token || process.env.NEO_TOKEN || getTokenFromScript()).
    // The genuine no-token skip (getTokenFromScript -> null) cannot be forced
    // deterministically here without invoking the real bash helper script,
    // which the test suite must not run; that branch is left as a documented
    // gap (see report). With a token present, resolution proceeds to fetch.
    await writeContract(validContract());
    process.env.NEO_TOKEN = 'env-token';
    let sawAuth;
    globalThis.fetch = async (_url, init) => {
      sawAuth = init.headers.Authorization;
      return { ok: true, json: async () => ({ data: [{ documentNo: 'X' }] }) };
    };
    const result = await validateFieldNames(TEST_SPEC, {});
    assert.equal(result.skipped, false);
    assert.equal(sawAuth, 'Bearer env-token');
  });

  it('skips when the API returns a non-ok response', async () => {
    await writeContract(validContract());
    globalThis.fetch = async () => ({ ok: false, status: 500, statusText: 'Server Error' });
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.match(result.reason, /API returned 500: Server Error/);
  });

  it('skips when the response body has no data', async () => {
    await writeContract(validContract());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [] }) });
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'No data in entity');
  });

  it('skips with a timeout reason on AbortError', async () => {
    await writeContract(validContract());
    globalThis.fetch = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.match(result.reason, /API request timed out \(5s\)/);
  });

  it('skips with "Etendo not running" on a generic throw with a code', async () => {
    await writeContract(validContract());
    globalThis.fetch = async () => {
      const err = new Error('connection refused');
      err.code = 'ECONNREFUSED';
      throw err;
    };
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, true);
    assert.match(result.reason, /Etendo not running \(ECONNREFUSED\)/);
  });

  it('produces a correct comparison on success', async () => {
    await writeContract(validContract());
    // Contract visible keys: documentNo, businessPartner (apiKey precedence).
    // API record keys: documentNo (matched), BusinessPartner (case mismatch),
    // surprise (extra), id/_identifier (meta, excluded).
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            documentNo: 'X',
            BusinessPartner: 'Y',
            surprise: 'Z',
            id: '1',
            _identifier: 'X',
          },
        ],
      }),
    });
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, false);
    assert.deepEqual(result.matched, ['documentNo']);
    assert.deepEqual(result.mismatched, [{ contract: 'businessPartner', api: 'BusinessPartner' }]);
    assert.deepEqual(result.missing, []);
    // Extra excludes meta keys (id, _identifier). The extra filter is
    // case-sensitive: 'BusinessPartner' is not in the contract key set
    // (which holds the lowercase 'businessPartner'), so it appears as extra
    // alongside 'surprise'.
    assert.deepEqual(result.extra, ['BusinessPartner', 'surprise']);
  });

  it('reflects opts.apiBaseUrl and specName in the fetch URL', async () => {
    await writeContract(validContract());
    let seenUrl;
    globalThis.fetch = async (url) => {
      seenUrl = url;
      return { ok: true, json: async () => ({ data: [{ documentNo: 'X' }] }) };
    };
    await validateFieldNames(TEST_SPEC, { token: 't', apiBaseUrl: 'http://example.test/etendo' });
    assert.equal(
      seenUrl,
      `http://example.test/etendo/sws/neo/${TEST_SPEC}/header?_startRow=0&_endRow=1`,
    );
  });

  it('reads records from response.data when top-level data is absent', async () => {
    await writeContract(validContract());
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ response: { data: [{ documentNo: 'X' }] } }),
    });
    const result = await validateFieldNames(TEST_SPEC, { token: 't' });
    assert.equal(result.skipped, false);
    assert.deepEqual(result.matched, ['documentNo']);
  });
});
