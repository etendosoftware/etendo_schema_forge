import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'RelatedDocuments.jsx'), 'utf8');

describe('RelatedDocuments', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function RelatedDocuments/);
  });

  it('defines RELATED_SPECS with goods-shipment and sales-invoice', () => {
    assert.match(src, /specName:\s*'goods-shipment'/);
    assert.match(src, /specName:\s*'sales-invoice'/);
  });

  it('uses criteria-based filtering (not simple query params)', () => {
    assert.match(src, /fieldName.*operator.*equals/);
    assert.match(src, /URLSearchParams.*criteria/);
  });

  it('fetches payments via Payment Plan → Payment Details chain', () => {
    assert.match(src, /Payment Plan/);
    assert.match(src, /Payment Details/);
  });

  it('renders nothing when all sections are empty', () => {
    assert.match(src, /sections\.length === 0.*return null/s);
  });

  it('uses correct entity names (camelCase for NEO)', () => {
    assert.match(src, /entityName:\s*'goodsShipment'/);
    assert.match(src, /entityName:\s*'invoice'/);
    assert.match(src, /finPayment/);
  });

  it('strips spec name from apiBaseUrl to build neoBase', () => {
    assert.match(src, /replace\(\/\\\/\[/);
  });
});
