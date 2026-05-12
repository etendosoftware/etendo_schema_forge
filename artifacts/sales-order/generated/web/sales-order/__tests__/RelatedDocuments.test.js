import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The component lives in the custom/ directory, not generated/
const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'custom', 'RelatedDocuments.jsx'), 'utf8');

describe('RelatedDocuments', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function RelatedDocuments/);
  });

  it('defines RELATED_SPECS with goods-shipment and sales-invoice', () => {
    assert.match(src, /key:\s*'goods-shipment'/);
    assert.match(src, /key:\s*'sales-invoice'/);
  });

  it('uses fetchByCriteria for shipments', () => {
    assert.match(src, /fetchByCriteria/);
    assert.match(src, /goodsShipment/);
  });

  it('fetches payments via paymentPlan and paymentDetails chain', () => {
    assert.match(src, /paymentPlan/);
    assert.match(src, /paymentDetails/);
  });

  it('always renders through RelatedDocumentsShell (empty state handled by shell)', () => {
    assert.doesNotMatch(src, /chips\.length === 0/);
    assert.match(src, /RelatedDocumentsShell/);
  });

  it('uses correct entity names (camelCase for NEO)', () => {
    assert.match(src, /goodsShipment/);
    assert.match(src, /finPayment/);
  });

  it('uses neoBase helper to build base URL', () => {
    assert.match(src, /neoBase/);
  });
});