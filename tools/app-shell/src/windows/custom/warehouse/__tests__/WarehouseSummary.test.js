import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'WarehouseSummary.jsx'), 'utf8');

describe('WarehouseSummary — currency formatting', () => {
  it('imports useCurrency and formatCurrency', () => {
    assert.match(src, /import.*useCurrency.*from.*@\/hooks\/useCurrency/);
    assert.match(src, /import.*formatCurrency.*from.*@\/lib\/formatCurrency/);
  });

  it('calls formatCurrency with currencyCode and totalValuation', () => {
    assert.match(src, /formatCurrency\(currencyCode,\s*totalValuation\)/);
  });

  it('falls back to USD when useCurrency returns nothing', () => {
    assert.match(src, /useCurrency\(\).*\?\?.*'USD'/);
  });
});

describe('WarehouseSummary — stock data section', () => {
  it('renders the stock data section title key', () => {
    assert.match(src, /warehouseStockDataTitle/);
  });

  it('renders the total valuation label key', () => {
    assert.match(src, /warehouseTotalValuation/);
  });

  it('renders the valuation badge key', () => {
    assert.match(src, /warehouseValuationBadge/);
  });

  it('renders the products with stock label key', () => {
    assert.match(src, /warehouseProductsWithStock/);
  });

  it('renders the products with stock badge key', () => {
    assert.match(src, /warehouseProductsWithStockBadge/);
  });
});

describe('WarehouseSummary — valuation calculation', () => {
  it('sums valuation from products using reduce', () => {
    assert.match(src, /products\.reduce.*valuation/s);
  });

  it('does not import chart or dashboard utilities', () => {
    assert.doesNotMatch(src, /niceScale/);
    assert.doesNotMatch(src, /formatDashboardAxisTick/);
    assert.doesNotMatch(src, /dashboardNumberFormat/);
  });

  it('does not render a StockChart or SVG chart', () => {
    assert.doesNotMatch(src, /StockChart/);
    assert.doesNotMatch(src, /warehouseStockTrend/);
  });
});
