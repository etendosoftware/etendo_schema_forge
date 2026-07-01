import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('PriceListWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function PriceListWindow/);
  });

  it('imports GeneratedApp from generated artifacts', () => {
    assert.match(src, /import GeneratedApp from '@generated\/price-list/);
  });

  it('imports PriceListProductPrices component', () => {
    assert.match(src, /import PriceListProductPrices from '\.\/PriceListProductPrices/);
  });

  it('passes CustomLines prop for product prices', () => {
    assert.match(src, /CustomLines=\{PriceListProductPrices\}/);
  });

  it('sets customLinesLabel', () => {
    assert.match(src, /customLinesLabel="Product Price"/);
  });

  it('nulls out standard detail components', () => {
    assert.match(src, /detailEntity=\{null\}/);
    assert.match(src, /DetailTable=\{null\}/);
    assert.match(src, /DetailForm=\{null\}/);
  });

  it('sets detailLabel', () => {
    assert.match(src, /detailLabel="Product Price"/);
  });
});
