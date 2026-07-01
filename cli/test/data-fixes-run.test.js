import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseArgs,
  tenantLabel,
  computeWatermark,
  toExitCode,
} from '../src/data-fixes/run.js';

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
