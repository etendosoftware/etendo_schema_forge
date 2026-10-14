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
} from '../src/data-fixes/run.js';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

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
