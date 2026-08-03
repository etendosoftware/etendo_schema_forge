/**
 * Transaction Type — mockData.js structural tests.
 *
 * First-ever generated frontend artifact for transaction-type (ETP-4658
 * onboarded it into the regen registry). Locks in that mock rows stay in
 * sync with the real transactionType entity fields declared in
 * contract.json — including searchKey, which is readOnly and therefore
 * absent from the form/table but still present in the mock data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(__dirname, '..', 'mockData.js'), 'utf8');
const { transactionType } = await import(join(__dirname, '..', 'mockData.js'));

describe('Transaction Type mockData — transactionType export', () => {
  it('exports an array named transactionType', () => {
    assert.match(src, /export const transactionType = \[/);
    assert.ok(Array.isArray(transactionType));
  });

  it('has a non-empty set of mock rows', () => {
    assert.ok(transactionType.length > 0);
  });

  it('every row carries the real entity fields from contract.json (name, active, searchKey)', () => {
    for (const row of transactionType) {
      assert.ok('id' in row);
      assert.ok('name' in row);
      assert.ok('active' in row);
      assert.ok('searchKey' in row, 'searchKey is readOnly but still shipped in mock data');
    }
  });

  it('uses the mock-transactionType-NNN id convention', () => {
    for (const row of transactionType) {
      assert.match(row.id, /^mock-transactionType-\d{3}$/);
    }
  });
});
