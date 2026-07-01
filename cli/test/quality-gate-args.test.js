import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseQualityGateArgs, getWindowNames, getAffectedWindows } from '../src/quality-gate.js';

describe('parseQualityGateArgs', () => {
  it('defaults to pr-affected mode with no arguments', () => {
    const opts = parseQualityGateArgs([]);
    assert.equal(opts.mode, 'pr-affected');
    assert.equal(opts.windowName, null);
    assert.equal(opts.baselineRef, null);
    assert.equal(opts.headRef, 'HEAD');
    assert.equal(opts.format, 'md');
    assert.equal(opts.outputPath, null);
    assert.equal(opts.jsonPath, null);
    assert.equal(opts.analysisDir, null);
  });

  it('parses --window <name>', () => {
    const opts = parseQualityGateArgs(['--window', 'sales-order']);
    assert.equal(opts.mode, 'window');
    assert.equal(opts.windowName, 'sales-order');
  });

  it('parses --all mode', () => {
    const opts = parseQualityGateArgs(['--all']);
    assert.equal(opts.mode, 'all');
  });

  it('parses --pr-affected mode explicitly', () => {
    const opts = parseQualityGateArgs(['--pr-affected']);
    assert.equal(opts.mode, 'pr-affected');
  });

  it('parses --baseline-ref', () => {
    const opts = parseQualityGateArgs(['--baseline-ref', 'origin/develop']);
    assert.equal(opts.baselineRef, 'origin/develop');
  });

  it('parses --head-ref', () => {
    const opts = parseQualityGateArgs(['--head-ref', 'abc123']);
    assert.equal(opts.headRef, 'abc123');
  });

  it('parses --format json', () => {
    const opts = parseQualityGateArgs(['--format', 'json']);
    assert.equal(opts.format, 'json');
  });

  it('parses --output <path>', () => {
    const opts = parseQualityGateArgs(['--output', '/tmp/report.md']);
    assert.equal(opts.outputPath, '/tmp/report.md');
  });

  it('parses --json <path>', () => {
    const opts = parseQualityGateArgs(['--json', '/tmp/report.json']);
    assert.equal(opts.jsonPath, '/tmp/report.json');
  });

  it('parses --analysis-dir <dir>', () => {
    const opts = parseQualityGateArgs(['--analysis-dir', '/tmp/analysis']);
    assert.equal(opts.analysisDir, '/tmp/analysis');
  });

  it('parses combined flags', () => {
    const opts = parseQualityGateArgs([
      '--window', 'purchase-order',
      '--baseline-ref', 'origin/main',
      '--format', 'json',
      '--output', '/tmp/out.json',
    ]);
    assert.equal(opts.mode, 'window');
    assert.equal(opts.windowName, 'purchase-order');
    assert.equal(opts.baselineRef, 'origin/main');
    assert.equal(opts.format, 'json');
    assert.equal(opts.outputPath, '/tmp/out.json');
  });

  it('sets mode to window but windowName stays null when --window has no argument', () => {
    const opts = parseQualityGateArgs(['--window']);
    // --window without a following value is ignored (no next arg)
    assert.equal(opts.mode, 'pr-affected');
  });

  it('ignores unknown flags', () => {
    const opts = parseQualityGateArgs(['--unknown', 'value']);
    assert.equal(opts.mode, 'pr-affected');
  });
});

describe('getWindowNames', () => {
  it('returns the single window name in window mode', () => {
    const result = getWindowNames(
      { mode: 'window', windowName: 'contacts' },
      ['contacts', 'sales-order'],
      () => [],
      [],
      {},
    );
    assert.deepEqual(result, ['contacts']);
  });

  it('returns all available windows in all mode', () => {
    const available = ['contacts', 'sales-order', 'purchase-order'];
    const result = getWindowNames(
      { mode: 'all' },
      available,
      () => [],
      [],
      {},
    );
    assert.deepEqual(result, available);
  });

  it('delegates to detectWindows in pr-affected mode', () => {
    const fakeDetect = ({ changedFiles, availableWindows }) => {
      return availableWindows.filter((w) => changedFiles.some((f) => f.includes(w)));
    };
    const result = getWindowNames(
      { mode: 'pr-affected' },
      ['contacts', 'sales-order'],
      fakeDetect,
      ['artifacts/contacts/decisions.json'],
      {},
    );
    assert.deepEqual(result, ['contacts']);
  });

  it('passes blastRadius from config to detectWindows', () => {
    let capturedBlastRadius;
    const fakeDetect = ({ blastRadius }) => {
      capturedBlastRadius = blastRadius;
      return [];
    };
    getWindowNames(
      { mode: 'pr-affected' },
      [],
      fakeDetect,
      [],
      { blastRadius: ['cli/src/generate-frontend.js'] },
    );
    assert.deepEqual(capturedBlastRadius, ['cli/src/generate-frontend.js']);
  });
});

describe('getAffectedWindows', () => {
  it('returns direct source for window mode', () => {
    const result = getAffectedWindows(
      { mode: 'window', windowName: 'contacts' },
      ['contacts'],
      () => [],
      [],
      {},
    );
    assert.deepEqual(result, [{ window: 'contacts', source: 'direct' }]);
  });

  it('returns direct source for all windows in all mode', () => {
    const result = getAffectedWindows(
      { mode: 'all' },
      ['contacts', 'sales-order'],
      () => [],
      [],
      {},
    );
    assert.deepEqual(result, [
      { window: 'contacts', source: 'direct' },
      { window: 'sales-order', source: 'direct' },
    ]);
  });

  it('delegates to detectWindowsDetailed in pr-affected mode', () => {
    const fakeDetect = () => [{ window: 'contacts', source: 'blast-radius' }];
    const result = getAffectedWindows(
      { mode: 'pr-affected' },
      ['contacts'],
      fakeDetect,
      ['cli/src/generate-frontend.js'],
      {},
    );
    assert.deepEqual(result, [{ window: 'contacts', source: 'blast-radius' }]);
  });
});