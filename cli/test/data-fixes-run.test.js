// @covers cli/src/data-fixes/run.js
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseArgs,
  tenantLabel,
  computeWatermark,
  toExitCode,
  formatReportDetail,
  optInChainGate,
  CHAIN_BEHIND,
  summarizeTenantLedger,
  formatOptInCell,
  applyChain,
  cmdTargetedFix,
  loadCatalogWithRetirement,
  runMain,
} from '../src/data-fixes/run.js';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';
import { setCacheMode } from '../src/db.js';
import pg from 'pg';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('parseArgs', () => {
  it('returns the default shape for no arguments', () => {
    assert.deepEqual(parseArgs([]), {
      dryRun: false,
      markFixed: false,
      listClients: false,
      client: null,
      fix: null,
      reason: null,
    });
  });

  it('sets the boolean flags', () => {
    const args = parseArgs(['--dry-run', '--mark-fixed', '--list-clients']);
    assert.equal(args.dryRun, true);
    assert.equal(args.markFixed, true);
    assert.equal(args.listClients, true);
  });

  it('consumes the next token for value-taking flags', () => {
    const args = parseArgs(['--client', 'CID', '--fix', 'R3-periodcontrol', '--reason', 'manual']);
    assert.equal(args.client, 'CID');
    assert.equal(args.fix, 'R3-periodcontrol');
    assert.equal(args.reason, 'manual');
  });

  it('mixes booleans and value flags in any order', () => {
    const args = parseArgs(['--fix', 'R1', '--dry-run', '--client', 'C0']);
    assert.equal(args.fix, 'R1');
    assert.equal(args.dryRun, true);
    assert.equal(args.client, 'C0');
    assert.equal(args.markFixed, false);
  });

  it('throws on an unknown argument', () => {
    assert.throws(() => parseArgs(['--nope']), /Unknown argument: --nope/);
  });
});

describe('tenantLabel', () => {
  it('renders "Name (clientId)" when the name is known', () => {
    const names = new Map([['C1', 'Acme Corp']]);
    assert.equal(tenantLabel(names, 'C1'), 'Acme Corp (C1)');
  });

  it('falls back to the bare id when the name is missing', () => {
    const names = new Map([['C1', 'Acme Corp']]);
    assert.equal(tenantLabel(names, 'C2'), 'C2');
  });

  it('falls back to the bare id when the names map is null', () => {
    assert.equal(tenantLabel(null, 'C3'), 'C3');
  });
});

describe('computeWatermark', () => {
  const ts = (iso) => new Date(iso);

  it('returns -Infinity with no baseline and nothing processed', () => {
    const catalog = [{ fixId: 'A', timestamp: ts('2026-06-12T12:00:00Z') }];
    const ledger = new Map();
    assert.equal(computeWatermark(catalog, ledger), -Infinity);
  });

  it('uses the baseline appliedUtc as the floor', () => {
    const catalog = [];
    const ledger = new Map([['__baseline__', { status: 'BASELINE', appliedUtc: '2026-06-01T00:00:00Z' }]]);
    assert.equal(computeWatermark(catalog, ledger), ts('2026-06-01T00:00:00Z').getTime());
  });

  it('advances to the newest PROCESSED catalog fix', () => {
    const catalog = [
      { fixId: 'A', timestamp: ts('2026-06-12T12:00:00Z') },
      { fixId: 'B', timestamp: ts('2026-06-16T12:00:00Z') },
    ];
    const ledger = new Map([
      ['A', { status: 'APPLIED', appliedUtc: '2026-06-12T12:00:00Z' }],
      ['B', { status: 'SKIPPED_NOT_NEEDED', appliedUtc: '2026-06-16T12:00:00Z' }],
    ]);
    assert.equal(computeWatermark(catalog, ledger), ts('2026-06-16T12:00:00Z').getTime());
  });

  it('counts MANUALLY_FIXED as processed', () => {
    const catalog = [{ fixId: 'A', timestamp: ts('2026-06-12T12:00:00Z') }];
    const ledger = new Map([['A', { status: 'MANUALLY_FIXED', appliedUtc: '2026-06-12T12:00:00Z' }]]);
    assert.equal(computeWatermark(catalog, ledger), ts('2026-06-12T12:00:00Z').getTime());
  });

  it('does NOT advance for FAILED or DETECTED rows', () => {
    const catalog = [
      { fixId: 'A', timestamp: ts('2026-06-12T12:00:00Z') },
      { fixId: 'B', timestamp: ts('2026-06-16T12:00:00Z') },
    ];
    const ledger = new Map([
      ['A', { status: 'FAILED', appliedUtc: '2026-06-12T12:00:00Z' }],
      ['B', { status: 'DETECTED', appliedUtc: '2026-06-16T12:00:00Z' }],
    ]);
    assert.equal(computeWatermark(catalog, ledger), -Infinity);
  });

  it('combines the baseline floor with processed fixes via Math.max', () => {
    const catalog = [{ fixId: 'A', timestamp: ts('2026-06-12T12:00:00Z') }];
    const ledger = new Map([
      ['__baseline__', { status: 'BASELINE', appliedUtc: '2026-06-16T12:00:00Z' }],
      ['A', { status: 'APPLIED', appliedUtc: '2026-06-12T12:00:00Z' }],
    ]);
    // baseline (Jun 16) is later than the processed fix (Jun 12) -> floor wins
    assert.equal(computeWatermark(catalog, ledger), ts('2026-06-16T12:00:00Z').getTime());
  });

  it('ignores processed fixes without a timestamp', () => {
    const catalog = [{ fixId: 'A', timestamp: null }];
    const ledger = new Map([['A', { status: 'APPLIED', appliedUtc: '2026-06-12T12:00:00Z' }]]);
    assert.equal(computeWatermark(catalog, ledger), -Infinity);
  });
});

describe('toExitCode', () => {
  it('maps a positive count to exit code 1', () => {
    assert.equal(toExitCode(1), 1);
    assert.equal(toExitCode(5), 1);
  });

  it('maps zero to exit code 0', () => {
    assert.equal(toExitCode(0), 0);
  });
});

describe('formatReportDetail', () => {
  it('returns null for no rows (nothing to report)', () => {
    assert.equal(formatReportDetail([]), null);
  });

  it('returns null for null/undefined input', () => {
    assert.equal(formatReportDetail(null), null);
    assert.equal(formatReportDetail(undefined), null);
  });

  it('formats a single row as key=value pairs prefixed with a count header', () => {
    const out = formatReportDetail([{ locator: 'L03', qtyonhand: -2 }]);
    assert.equal(out, '1 row(s) need manual attention:\n- locator=L03, qtyonhand=-2');
  });

  it('formats multiple rows, one bullet line each, in order', () => {
    const out = formatReportDetail([
      { locator: 'L03', product: 'A' },
      { locator: 'T02', product: 'B' },
    ]);
    assert.equal(
      out,
      '2 row(s) need manual attention:\n- locator=L03, product=A\n- locator=T02, product=B',
    );
  });

  it('caps the output length and appends an ellipsis when it exceeds maxLen', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ locator: `L${i}`, note: 'x'.repeat(20) }));
    const out = formatReportDetail(rows, { maxLen: 200 });
    assert.ok(out.length <= 200);
    assert.ok(out.endsWith('...'));
    // The count header (based on the FULL row count, not the truncated list) survives the cap.
    assert.ok(out.startsWith('500 row(s) need manual attention:'));
  });

  it('does not truncate when the formatted text fits within the default maxLen', () => {
    const out = formatReportDetail([{ a: 1 }]);
    assert.ok(!out.endsWith('...'));
  });
});

// ---------------------------------------------------------------------------
// Opt-in fixes (`-- @optIn: true`): never run by a full run, never move the
// watermark, run only through --fix once the tenant's chain is current.
// ---------------------------------------------------------------------------

const CLIENT = 'C'.repeat(32);

/** Build a catalog entry the way loadCatalog() does, from a synthetic fix file. */
function catalogFix(fixId, { optIn = false, retired = false } = {}) {
  const tag = fixId.split('__')[1];
  const text = [
    `-- @id: ${tag}`,
    ...(optIn ? ['-- @optIn: true'] : []),
    '-- @check',
    `SELECT /*check:${tag}*/ 1 FROM t WHERE ad_client_id = :client_id;`,
    '-- @apply',
    `UPDATE /*apply:${tag}*/ t SET x = 1 WHERE ad_client_id = :client_id;`,
  ].join('\n');
  const fix = parseFix(text, fixId);
  fix.timestamp = parseFixTimestamp(fixId);
  fix.retired = retired;
  return fix;
}

const A = catalogFix('20261001T120000Z__A-chain');
const OPT = catalogFix('20261002T120000Z__OPT-switch', { optIn: true });
const B = catalogFix('20261003T120000Z__B-chain');
const CATALOG = [A, OPT, B];

const ledgerOf = (entries) => new Map(entries.map(([fixId, status, appliedUtc = '2026-10-10T00:00:00Z']) =>
  [fixId, { status, appliedUtc }]));

/**
 * A pg-pool stand-in that records which @check / @apply bodies ran and which
 * ledger rows were written. Bodies are recognised by their inline check:X / apply:X marker comment.
 */
function fakePool({ ledgerRows = [], checkMatches = 1 } = {}) {
  const calls = { checks: [], applies: [], ledgerWrites: [], tx: [] };
  const query = async (sql, params) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) { calls.tx.push(sql); return {}; }
    if (sql.includes('FROM etgo_data_fix_history WHERE remediated_client_id')) {
      return { rows: ledgerRows.map(([fix_id, status, applied_utc = '2026-10-10T00:00:00Z']) => ({ fix_id, status, applied_utc })) };
    }
    if (sql.includes('INSERT INTO etgo_data_fix_history')) {
      calls.ledgerWrites.push({ fixId: params[3], status: params[4] });
      return { rowCount: 1 };
    }
    if (sql.includes('SELECT ad_client_id, name FROM ad_client')) return { rows: [{ ad_client_id: CLIENT, name: 'Acme' }] };
    if (sql.includes('SELECT ad_client_id FROM ad_client')) return { rows: [{ ad_client_id: CLIENT }] };
    const check = sql.match(/\/\*check:([\w-]+)\*\//);
    if (check) { calls.checks.push(check[1]); return { rowCount: checkMatches, rows: [] }; }
    const apply = sql.match(/\/\*apply:([\w-]+)\*\//);
    if (apply) { calls.applies.push(apply[1]); return { rowCount: 1, rows: [] }; }
    throw new Error(`fakePool: unexpected SQL ${sql.slice(0, 80)}`);
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

describe('opt-in fixes — pure helpers', () => {
  it('computeWatermark ignores an opt-in fix, even when it is APPLIED', () => {
    const ledger = ledgerOf([['__baseline__', 'BASELINE', '2026-09-01T00:00:00Z'], [OPT.fixId, 'APPLIED']]);
    assert.equal(computeWatermark(CATALOG, ledger), new Date('2026-09-01T00:00:00Z').getTime());
  });

  it('computeWatermark ignores an opt-in fix marked MANUALLY_FIXED (--mark-fixed)', () => {
    const ledger = ledgerOf([['__baseline__', 'BASELINE', '2026-09-01T00:00:00Z'], [OPT.fixId, 'MANUALLY_FIXED']]);
    assert.equal(computeWatermark(CATALOG, ledger), new Date('2026-09-01T00:00:00Z').getTime());
  });

  it('optInChainGate is not opened by marking the opt-in fix itself MANUALLY_FIXED', () => {
    const ledger = ledgerOf([['__baseline__', 'BASELINE', '2026-09-01T00:00:00Z'], [OPT.fixId, 'MANUALLY_FIXED']]);
    assert.equal(optInChainGate(CATALOG, ledger, OPT).allowed, false);
  });

  it('optInChainGate refuses a tenant whose chain has not reached the opt-in date', () => {
    const ledger = ledgerOf([['__baseline__', 'BASELINE', '2026-09-01T00:00:00Z'], [A.fixId, 'APPLIED']]);
    const gate = optInChainGate(CATALOG, ledger, OPT);
    assert.equal(gate.allowed, false);
    assert.equal(gate.watermark, A.timestamp.getTime());
  });

  it('optInChainGate allows a tenant whose watermark is at or past the opt-in date', () => {
    const past = optInChainGate(CATALOG, ledgerOf([[A.fixId, 'APPLIED'], [B.fixId, 'SKIPPED_NOT_NEEDED']]), OPT);
    assert.equal(past.allowed, true);
    const equal = optInChainGate(CATALOG, ledgerOf([['__baseline__', 'BASELINE', '2026-10-02T12:00:00Z']]), OPT);
    assert.equal(equal.allowed, true);
  });

  it('optInChainGate refuses a tenant with no ledger at all', () => {
    assert.equal(optInChainGate(CATALOG, new Map(), OPT).allowed, false);
  });

  it('optInChainGate never gates an ordinary chain fix', () => {
    assert.equal(optInChainGate(CATALOG, new Map(), A).allowed, true);
  });

  it('summarizeTenantLedger never counts an un-run opt-in fix as pending', () => {
    const s = summarizeTenantLedger(CATALOG, ledgerOf([[A.fixId, 'APPLIED'], [B.fixId, 'APPLIED']]));
    assert.equal(s.pending, 0);
    assert.equal(s.failed, 0);
    assert.deepEqual(s.optIn, { done: 0, total: 1, failed: 0 });
  });

  it('summarizeTenantLedger reports a FAILED opt-in under OPT-IN, not in the chain FAILED count', () => {
    const s = summarizeTenantLedger(CATALOG, ledgerOf([[A.fixId, 'APPLIED'], [B.fixId, 'APPLIED'], [OPT.fixId, 'FAILED']]));
    assert.equal(s.failed, 0);
    assert.deepEqual(s.optIn, { done: 0, total: 1, failed: 1 });
  });

  it('summarizeTenantLedger counts an applied opt-in as done and as the last applied fix', () => {
    const s = summarizeTenantLedger(CATALOG, ledgerOf([[A.fixId, 'APPLIED'], [OPT.fixId, 'APPLIED']]));
    assert.equal(s.pending, 1); // B, a chain fix
    assert.deepEqual(s.optIn, { done: 1, total: 1, failed: 0 });
    assert.equal(s.lastApplied.fixId, OPT.fixId);
  });

  it('summarizeTenantLedger leaves retired fixes out of pending and out of opt-in', () => {
    const retiredOpt = catalogFix('20261004T120000Z__OLD-switch', { optIn: true, retired: true });
    const retiredChain = catalogFix('20261005T120000Z__OLD-chain', { retired: true });
    const s = summarizeTenantLedger([...CATALOG, retiredOpt, retiredChain], ledgerOf([[A.fixId, 'APPLIED'], [B.fixId, 'APPLIED']]));
    assert.equal(s.pending, 0);
    assert.equal(s.optIn.total, 1);
  });

  it('formatOptInCell renders done/total, the failures, and a dash with no opt-in fixes', () => {
    assert.equal(formatOptInCell({ done: 0, total: 1, failed: 0 }), '0/1');
    assert.equal(formatOptInCell({ done: 0, total: 1, failed: 1 }), '0/1 (1 FAILED)');
    assert.equal(formatOptInCell({ done: 0, total: 0, failed: 0 }), '—');
  });
});

describe('opt-in fixes — runner behavior (fake pool)', () => {
  beforeEach(() => { mock.method(console, 'log', () => {}); });
  afterEach(() => { mock.restoreAll(); });

  it('a full run never evaluates an opt-in fix: no @check, no @apply, no ledger row', async () => {
    const pool = fakePool({ ledgerRows: [['__baseline__', 'DETECTED', '2026-01-01']] });
    const halted = await applyChain(pool, CATALOG, CLIENT, new Map(), { dryRun: false });
    assert.equal(halted, false);
    assert.deepEqual(pool.calls.checks, ['A-chain', 'B-chain']);
    assert.deepEqual(pool.calls.applies, ['A-chain', 'B-chain']);
    assert.deepEqual(pool.calls.ledgerWrites.map(w => w.fixId), [A.fixId, B.fixId]);
  });

  it('a full run still applies a chain fix dated before an opt-in fix the tenant already APPLIED', async () => {
    // The opt-in row must not move the watermark, or A would be skipped forever.
    const pool = fakePool({ ledgerRows: [['__baseline__', 'DETECTED', '2026-01-01'], [OPT.fixId, 'APPLIED']] });
    await applyChain(pool, CATALOG, CLIENT, new Map(), { dryRun: false });
    assert.deepEqual(pool.calls.checks, ['A-chain', 'B-chain']);
  });

  it('a full run still applies a chain fix dated before an opt-in fix marked MANUALLY_FIXED', async () => {
    const pool = fakePool({ ledgerRows: [['__baseline__', 'DETECTED', '2026-01-01'], [OPT.fixId, 'MANUALLY_FIXED']] });
    await applyChain(pool, CATALOG, CLIENT, new Map(), { dryRun: false });
    assert.deepEqual(pool.calls.checks, ['A-chain', 'B-chain']);
    assert.ok(!pool.calls.ledgerWrites.some(w => w.fixId === OPT.fixId), 'the MANUALLY_FIXED opt-in row is left alone');
  });

  it('--fix applies an opt-in fix for a tenant whose chain is current, whatever the watermark', async () => {
    const pool = fakePool({ ledgerRows: [[A.fixId, 'APPLIED'], [B.fixId, 'APPLIED']] });
    const failed = await cmdTargetedFix(pool, CATALOG, { client: CLIENT, fix: 'OPT-switch', dryRun: false });
    assert.equal(failed, 0);
    assert.deepEqual(pool.calls.checks, ['OPT-switch']);
    assert.deepEqual(pool.calls.applies, ['OPT-switch']);
    assert.deepEqual(pool.calls.ledgerWrites, [{ fixId: OPT.fixId, status: 'APPLIED' }]);
    assert.deepEqual(pool.calls.tx, ['BEGIN', 'COMMIT']);
  });

  it('--fix --dry-run on an opt-in fix runs @check only and writes nothing', async () => {
    const pool = fakePool({ ledgerRows: [[A.fixId, 'APPLIED'], [B.fixId, 'APPLIED']] });
    const failed = await cmdTargetedFix(pool, CATALOG, { client: CLIENT, fix: OPT.fixId, dryRun: true });
    assert.equal(failed, 0);
    assert.deepEqual(pool.calls.checks, ['OPT-switch']);
    assert.deepEqual(pool.calls.applies, []);
    assert.deepEqual(pool.calls.ledgerWrites, []);
    assert.deepEqual(pool.calls.tx, []);
  });

  it('--fix refuses an opt-in fix for a tenant behind it: no @check, no ledger row, counted as failed', async () => {
    const lines = [];
    console.log.mock.mockImplementation((msg) => lines.push(msg));
    const pool = fakePool({ ledgerRows: [['__baseline__', 'BASELINE', '2026-09-01T00:00:00Z'], [A.fixId, 'APPLIED']] });
    const failed = await cmdTargetedFix(pool, CATALOG, { client: CLIENT, fix: OPT.fixId, dryRun: true });
    assert.equal(failed, 1);
    assert.deepEqual(pool.calls.checks, []);
    assert.deepEqual(pool.calls.ledgerWrites, []);
    assert.ok(lines.some(l => String(l).includes(CHAIN_BEHIND)), `expected a ${CHAIN_BEHIND} line`);
  });

  it('--fix still refuses a retired opt-in fix outright', async () => {
    const retiredOpt = catalogFix('20261004T120000Z__OLD-switch', { optIn: true, retired: true });
    const pool = fakePool();
    await assert.rejects(
      () => cmdTargetedFix(pool, [...CATALOG, retiredOpt], { client: CLIENT, fix: retiredOpt.fixId, dryRun: false }),
      /is retired/,
    );
    assert.deepEqual(pool.calls.checks, []);
  });

  it('--fix on an ordinary chain fix is not gated by the chain position', async () => {
    const pool = fakePool({ ledgerRows: [] });
    const failed = await cmdTargetedFix(pool, CATALOG, { client: CLIENT, fix: B.fixId, dryRun: true });
    assert.equal(failed, 0);
    assert.deepEqual(pool.calls.checks, ['B-chain']);
  });
});

describe('opt-in fixes — the real catalog', () => {
  // Every opt-in fix, by fix_id. Adding one is a deliberate act: update this list with it.
  const OPT_IN_FIXES = ['20261005T180000Z__R37-tenant-subscription-backfill'];

  it('flags exactly the expected fixes as opt-in', async () => {
    const catalog = await loadCatalogWithRetirement();
    assert.deepEqual(catalog.filter(f => f.optIn).map(f => f.fixId).sort(), [...OPT_IN_FIXES].sort());
  });

  it('never marks a fix both retired and opt-in', async () => {
    const catalog = await loadCatalogWithRetirement();
    assert.deepEqual(catalog.filter(f => f.optIn && f.retired).map(f => f.fixId), []);
  });
});

// ---------------------------------------------------------------------------
// runMain — the CLI entry point (--list-clients, --fix, --mark-fixed, full run)
// against the REAL catalog, with pg.Pool swapped for a stateful in-memory pool.
// ---------------------------------------------------------------------------

const R37_ID = 'R37-tenant-subscription-backfill';
const R37_FIX_ID = '20261005T180000Z__R37-tenant-subscription-backfill';
const R47_FIX_ID = '20261005T160407Z__R47-gl-journal-draft-datedoc-sync';
const FAKE_DB = { host: 'fake-db', port: 5432, user: 'tester', database: 'fake' };

const CAUGHT_UP = { id: 'A'.repeat(32), name: 'Acme', ledger: [['__baseline__', 'BASELINE', '2026-10-06T00:00:00Z']] };
const BEHIND = { id: 'B'.repeat(32), name: 'Globex', ledger: [['__baseline__', 'DETECTED', '2026-01-01']] };

/**
 * A pg-pool stand-in that answers the runner's own queries from per-tenant
 * in-memory ledgers (updated by every ledger write) and records every fix body
 * (@check / @apply / @report — always sent without bind params) it is asked to run.
 */
function tenantDbPool(tenants, { checkMatches = 0 } = {}) {
  const ledgers = new Map(tenants.map(t => [t.id, new Map((t.ledger || []).map(
    ([fixId, status, appliedUtc = '2026-10-10T00:00:00Z']) => [fixId, { status, appliedUtc }]))]));
  const byName = [...tenants].sort((a, b) => a.name.localeCompare(b.name));
  const scoped = params => tenants.filter(t => !params[0] || t.id === params[0]);
  const calls = { ledgerWrites: [], fixBodies: [], tx: [], ended: false };
  const query = async (sql, params) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) { calls.tx.push(sql); return {}; }
    if (sql.startsWith("SELECT ad_client_id, name FROM ad_client WHERE ad_client_id <> '0'")) {
      return { rows: byName.map(t => ({ ad_client_id: t.id, name: t.name })) };
    }
    if (params === undefined) { calls.fixBodies.push(sql); return { rowCount: checkMatches, rows: [] }; }
    if (sql.includes('FROM etgo_data_fix_history WHERE remediated_client_id')) {
      return { rows: [...(ledgers.get(params[0]) ?? [])].map(([fix_id, r]) => ({ fix_id, status: r.status, applied_utc: r.appliedUtc })) };
    }
    if (sql.includes('INSERT INTO etgo_data_fix_history')) {
      const [, , clientId, fixId, status, appliedUtc] = params;
      calls.ledgerWrites.push({ clientId, fixId, status });
      ledgers.get(clientId).set(fixId, { status, appliedUtc });
      return { rowCount: 1 };
    }
    if (sql.includes('NOT EXISTS (SELECT 1 FROM etgo_data_fix_history')) {
      return { rows: scoped(params).filter(t => ledgers.get(t.id).size === 0).map(t => ({ ad_client_id: t.id })) };
    }
    if (sql.includes('SELECT ad_client_id FROM ad_client')) return { rows: scoped(params).map(t => ({ ad_client_id: t.id })) };
    if (sql.includes('SELECT ad_org_id FROM ad_org')) return { rows: [{ ad_org_id: 'O'.repeat(32) }] };
    if (sql.includes('SELECT name FROM ad_client WHERE ad_client_id = $1')) {
      return { rows: [{ name: tenants.find(t => t.id === params[0])?.name }] };
    }
    throw new Error(`tenantDbPool: unexpected SQL ${sql.slice(0, 80)}`);
  };
  return {
    calls,
    ledgers,
    query,
    connect: async () => ({ query, release() {} }),
    end: async () => { calls.ended = true; },
  };
}

describe('runMain — opt-in fixes through the CLI entry point', () => {
  let logDir;
  let priorLogDir;
  let lines;
  let catalog;
  let r37;

  beforeEach(async () => {
    setCacheMode({ mode: 'off' });
    catalog = await loadCatalogWithRetirement();
    r37 = catalog.find(f => f.fixId === R37_FIX_ID);
    priorLogDir = process.env.SF_DATA_FIX_LOG_DIR;
    logDir = mkdtempSync(join(tmpdir(), 'data-fixes-run-test-'));
    process.env.SF_DATA_FIX_LOG_DIR = logDir;
    lines = [];
    mock.method(console, 'log', (...args) => lines.push(args.join(' ')));
  });

  afterEach(() => {
    mock.restoreAll();
    if (priorLogDir === undefined) delete process.env.SF_DATA_FIX_LOG_DIR;
    else process.env.SF_DATA_FIX_LOG_DIR = priorLogDir;
    rmSync(logDir, { recursive: true, force: true });
  });

  /** Run the CLI with every `new pg.Pool(...)` answered by `pool`. */
  function runCli(pool, argv) {
    mock.method(pg, 'Pool', function FakePgPool() { return pool; });
    return runMain({ dbConfig: FAKE_DB, argv });
  }

  /** Text of the execution logs written so far (one file per run second). */
  function executionLog() {
    return readdirSync(logDir).map(f => readFileSync(join(logDir, f), 'utf-8')).join('\n');
  }

  /** The R37 @check body as the runner sends it for a tenant. */
  const r37Check = clientId => inlineParams(r37.check, { client_id: clientId });

  describe('--list-clients', () => {
    const TENANTS = [
      { id: 'C'.repeat(32), name: 'Initech', ledger: [] },
      { id: 'A'.repeat(32), name: 'Acme', ledger: [['__baseline__', 'BASELINE', '2026-10-06T00:00:00Z'], [R37_FIX_ID, 'APPLIED']] },
      { id: 'E'.repeat(32), name: 'Globex International Holdings', ledger: [[R37_FIX_ID, 'FAILED']] },
    ];

    it('lists the opt-in fixes under their own header line, before the table', async () => {
      const pool = tenantDbPool(TENANTS);
      const code = await runCli(pool, ['--list-clients']);
      assert.equal(code, 0);
      assert.equal(lines[0], `Catalog: ${catalog.length} fix(es). Tenants: 3.`);
      assert.equal(lines[1],
        'Opt-in fixes (never run by a full run; apply with --fix <id>, counted under OPT-IN, never PENDING):');
      assert.equal(lines[2], `  - ${R37_FIX_ID}`);
      assert.equal(lines[3], '');
      assert.ok(lines[4].startsWith('TENANT'), 'the table header follows the opt-in list');
    });

    it('aligns every row of the table, OPT-IN column included, under the header', async () => {
      const pool = tenantDbPool(TENANTS);
      await runCli(pool, ['--list-clients']);
      const header = lines.find(l => l.startsWith('TENANT'));
      const at = lines.indexOf(header);
      const separator = lines[at + 1];
      const rows = lines.slice(at + 2);

      assert.match(separator, /^-+$/);
      assert.equal(separator.length, header.length);
      assert.equal(rows.length, 3);
      for (const row of rows) assert.equal(row.length, header.length, `row "${row}" is as wide as the header`);

      const cell = (row, name, next) => row.slice(header.indexOf(name), next ? header.indexOf(next) : undefined).trim();
      const chainCount = catalog.filter(f => !f.retired && !f.optIn).length;
      const table = rows.map(row => ({
        tenant: cell(row, 'TENANT', 'CLIENT_ID'),
        clientId: cell(row, 'CLIENT_ID', 'LAST APPLIED'),
        lastApplied: cell(row, 'LAST APPLIED', 'PENDING'),
        pending: cell(row, 'PENDING', 'FAILED'),
        failed: cell(row, 'FAILED', 'OPT-IN'),
        optIn: cell(row, 'OPT-IN'),
      }));
      assert.deepEqual(table, [
        { tenant: 'Acme', clientId: 'A'.repeat(32), lastApplied: R37_ID, pending: String(chainCount), failed: '0', optIn: '1/1' },
        { tenant: 'Globex International Holdings', clientId: 'E'.repeat(32), lastApplied: '—', pending: String(chainCount), failed: '0', optIn: '0/1 (1 FAILED)' },
        { tenant: 'Initech', clientId: 'C'.repeat(32), lastApplied: '—', pending: String(chainCount), failed: '0', optIn: '0/1' },
      ]);
      // The widest OPT-IN cell sets the column width: the header label is padded to it.
      assert.ok(header.endsWith(`OPT-IN${' '.repeat('0/1 (1 FAILED)'.length - 'OPT-IN'.length)}`));
    });

    it('is read-only: no ledger write, no fix body, no execution log', async () => {
      const pool = tenantDbPool(TENANTS);
      await runCli(pool, ['--list-clients']);
      assert.deepEqual(pool.calls.ledgerWrites, []);
      assert.deepEqual(pool.calls.fixBodies, []);
      assert.deepEqual(readdirSync(logDir), []);
      assert.equal(pool.calls.ended, true);
    });
  });

  describe('--fix <opt-in>', () => {
    it('exits 1 and logs FAILED when some tenants are blocked behind the opt-in date', async () => {
      const pool = tenantDbPool([CAUGHT_UP, BEHIND]);
      const code = await runCli(pool, ['--fix', R37_ID, '--dry-run']);
      assert.equal(code, 1);
      assert.match(executionLog(), new RegExp(`SUMMARY: targeted fix ${R37_ID} — FAILED\\.`));
      // The blocked tenant is reported, and only the caught-up one reaches @check.
      assert.ok(lines.some(l => l.includes(`Globex (${BEHIND.id}): BLOCKED_CHAIN_BEHIND`)), 'Globex is reported as blocked');
      assert.deepEqual(pool.calls.fixBodies, [r37Check(CAUGHT_UP.id)]);
      assert.deepEqual(pool.calls.ledgerWrites, []);
    });

    it('exits 0 and logs ok when every tenant is caught up', async () => {
      const pool = tenantDbPool([CAUGHT_UP]);
      const code = await runCli(pool, ['--fix', R37_ID, '--dry-run']);
      assert.equal(code, 0);
      assert.match(executionLog(), new RegExp(`SUMMARY: targeted fix ${R37_ID} — ok\\.`));
    });

    it('applies R37 for a caught-up tenant, and the next full run leaves it untouched', async () => {
      const pool = tenantDbPool([CAUGHT_UP], { checkMatches: 1 });
      assert.equal(await runCli(pool, ['--fix', R37_ID, '--client', CAUGHT_UP.id]), 0);
      assert.deepEqual(pool.calls.ledgerWrites, [{ clientId: CAUGHT_UP.id, fixId: R37_FIX_ID, status: 'APPLIED' }]);
      assert.deepEqual(pool.calls.tx, ['BEGIN', 'COMMIT']);

      pool.calls.fixBodies.length = 0;
      pool.calls.ledgerWrites.length = 0;
      lines.length = 0;
      assert.equal(await runCli(pool, ['--client', CAUGHT_UP.id]), 0);

      assert.ok(!pool.calls.fixBodies.includes(r37Check(CAUGHT_UP.id)), 'R37 @check is not run again');
      assert.ok(!pool.calls.ledgerWrites.some(w => w.fixId === R37_FIX_ID), 'no R37 ledger write');
      assert.equal(pool.ledgers.get(CAUGHT_UP.id).get(R37_FIX_ID).status, 'APPLIED');
      assert.ok(lines.some(l => l.includes(`${R37_FIX_ID}: OPT-IN — skipped by a full run (ledger: APPLIED)`)));
      // Applying R37 did not move the watermark: it still sits on the baseline.
      assert.ok(lines.some(l => l.includes('(watermark: 2026-10-06T00:00:00.000Z)')));
    });
  });

  describe('--mark-fixed on an opt-in fix', () => {
    it('records MANUALLY_FIXED without moving the watermark past an earlier pending chain fix', async () => {
      // Chain current up to just before R47 (16:04), which is dated before R37 (18:00).
      const tenant = { id: 'D'.repeat(32), name: 'Marked', ledger: [['__baseline__', 'BASELINE', '2026-10-05T15:00:00Z']] };
      const pool = tenantDbPool([tenant]);
      assert.equal(await runCli(pool,
        ['--mark-fixed', '--client', tenant.id, '--fix', R37_FIX_ID, '--reason', 'switched by hand']), 0);
      assert.deepEqual(pool.calls.ledgerWrites, [{ clientId: tenant.id, fixId: R37_FIX_ID, status: 'MANUALLY_FIXED' }]);

      pool.calls.ledgerWrites.length = 0;
      assert.equal(await runCli(pool, ['--client', tenant.id]), 0);
      const written = pool.calls.ledgerWrites.map(w => w.fixId);
      assert.ok(written.includes(R47_FIX_ID), 'R47, dated before R37, is still evaluated');
      assert.ok(!written.includes(R37_FIX_ID), 'the MANUALLY_FIXED R37 row is left alone');
      assert.ok(lines.some(l => l.includes('(watermark: 2026-10-05T15:00:00.000Z)')));
    });
  });
});
