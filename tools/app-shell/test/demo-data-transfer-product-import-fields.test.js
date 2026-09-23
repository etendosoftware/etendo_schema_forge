/**
 * ETP-5364 — this is the functional-repository half of the demo transfer contract.
 *
 * The runtime module and Schema Forge are independently checked out in CI, so a test that reads
 * the sibling module is not executable in either repository's normal pipeline. Keep the ordered
 * Product import API explicit here and in DemoDataTransferServiceTest: changing either contract
 * requires an intentional matching review in the other repository.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const contract = JSON.parse(readFileSync(join(ROOT, 'artifacts/product/contract.json'), 'utf8'));
const TRANSFER_PRODUCT_FIELDS = [
  'searchKey', 'name', 'description', 'productType', 'uOM',
  'salesPrice', 'purchasePrice', 'cost', 'costStartingDate', 'category',
];

describe('ETP-5364 — Product import fields required by demo transfer', () => {
  it('keeps the ordered import API used for demo-to-productive migration', () => {
    assert.deepEqual(contract.frontendContract.window.import.fields.map(({ target }) => target),
      TRANSFER_PRODUCT_FIELDS);
  });
});
