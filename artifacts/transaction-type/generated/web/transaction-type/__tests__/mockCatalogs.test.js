/**
 * Transaction Type — mockCatalogs.js structural tests.
 *
 * Locks in that mockCatalogs.js stays an intentionally-empty selector
 * catalog, consistent with `api.selectors` being empty in
 * TransactionTypePage.jsx (no foreign-key/lookup fields on this entity).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(__dirname, '..', 'mockCatalogs.js'), 'utf8');
const catalogs = (await import(join(__dirname, '..', 'mockCatalogs.js'))).default;

describe('Transaction Type mockCatalogs — default export', () => {
  it('declares an empty catalogs object', () => {
    assert.match(src, /const catalogs = \{\};/);
  });

  it('exports the empty catalogs object as default', () => {
    assert.match(src, /export default catalogs;/);
    assert.deepEqual(catalogs, {});
  });

  it('stays empty because transactionType has no selectors (api.selectors is empty)', () => {
    const pageSrc = readFileSync(join(__dirname, '..', 'TransactionTypePage.jsx'), 'utf8');
    assert.match(pageSrc, /"selectors":\s*\[\]/);
    assert.equal(Object.keys(catalogs).length, 0);
  });
});
