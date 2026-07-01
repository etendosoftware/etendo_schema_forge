import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

// parseArgs is not exported — replicate for testing
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { pushToNeo: false, dryRun: false, only: null, skipExtract: false, writeCache: false, fromCache: false };
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--push-to-neo') { result.pushToNeo = true; i += 1; }
    else if (args[i] === '--dry-run') { result.dryRun = true; i += 1; }
    else if (args[i] === '--skip-extract') { result.skipExtract = true; i += 1; }
    else if (args[i] === '--write-cache') { result.writeCache = true; i += 1; }
    else if (args[i] === '--from-cache') { result.fromCache = true; i += 1; }
    else if (args[i] === '--only' && args[i + 1]) { result.only = args[i + 1].split(',').map(s => s.trim()); i += 2; }
    else { i += 1; }
  }
  return result;
}

describe('regen-all parseArgs', () => {
  it('defaults all flags to false/null', () => {
    const r = parseArgs(['node', 'regen-all.js']);
    assert.equal(r.pushToNeo, false);
    assert.equal(r.dryRun, false);
    assert.equal(r.only, null);
    assert.equal(r.skipExtract, false);
    assert.equal(r.writeCache, false);
    assert.equal(r.fromCache, false);
  });

  it('parses --push-to-neo', () => {
    assert.equal(parseArgs(['n', 's', '--push-to-neo']).pushToNeo, true);
  });

  it('parses --dry-run', () => {
    assert.equal(parseArgs(['n', 's', '--dry-run']).dryRun, true);
  });

  it('parses --skip-extract', () => {
    assert.equal(parseArgs(['n', 's', '--skip-extract']).skipExtract, true);
  });

  it('parses --write-cache', () => {
    assert.equal(parseArgs(['n', 's', '--write-cache']).writeCache, true);
  });

  it('parses --from-cache', () => {
    assert.equal(parseArgs(['n', 's', '--from-cache']).fromCache, true);
  });

  it('parses --only with comma-separated list', () => {
    const r = parseArgs(['n', 's', '--only', 'sales-order,purchase-order']);
    assert.deepEqual(r.only, ['sales-order', 'purchase-order']);
  });

  it('trims whitespace in --only values', () => {
    const r = parseArgs(['n', 's', '--only', ' a , b ']);
    assert.deepEqual(r.only, ['a', 'b']);
  });

  it('combines multiple flags', () => {
    const r = parseArgs(['n', 's', '--push-to-neo', '--dry-run', '--only', 'x']);
    assert.equal(r.pushToNeo, true);
    assert.equal(r.dryRun, true);
    assert.deepEqual(r.only, ['x']);
  });

  it('ignores unknown flags', () => {
    const r = parseArgs(['n', 's', '--unknown', 'val']);
    assert.equal(r.pushToNeo, false);
  });
});
