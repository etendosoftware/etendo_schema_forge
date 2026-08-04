import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'WarehouseCustomTable.jsx'), 'utf8');

describe('WarehouseCustomTable — columns', () => {
  it('defines four columns: name, searchKey, locationAddress, productCount', () => {
    assert.match(src, /key: 'name'/);
    assert.match(src, /key: 'searchKey'/);
    assert.match(src, /key: 'locationAddress'/);
    assert.match(src, /key: 'productCount'/);
  });

  it('name column renders with font-semibold', () => {
    assert.match(src, /font-semibold.*\{row\.name\}/s);
  });

  it('searchKey column renders a badge with semantic muted background', () => {
    assert.match(src, /bg-\[hsl\(var\(--muted\)\)\]/);
  });

  it('locationAddress resolves locationAddress\$_identifier before raw value', () => {
    assert.match(src, /locationAddress\$_identifier.*locationAddress/s);
  });

  it('locationAddress and productCount columns are not sortable', () => {
    const locationBlock = src.slice(src.indexOf("key: 'locationAddress'"), src.indexOf("key: 'productCount'"));
    assert.match(locationBlock, /sortable: false/);
    const productBlock = src.slice(src.indexOf("key: 'productCount'"), src.indexOf('const filters'));
    assert.match(productBlock, /sortable: false/);
  });
});

describe('WarehouseCustomTable — filters', () => {
  it('filters on searchKey and name', () => {
    assert.match(src, /filters = \['searchKey', 'name'\]/);
  });
});

describe('WarehouseCustomTable — product count cell', () => {
  it('deduplicates in-flight requests by key', () => {
    assert.match(src, /inFlightCounts/);
    assert.match(src, /inFlightCounts\.has\(key\)/);
  });

  it('fetches storageBins then binContents to compute product count', () => {
    assert.match(src, /storageBin\?parentId/);
    assert.match(src, /binContents\?parentId/);
  });

  it('shows dash when count is undefined or null', () => {
    assert.match(src, /count === undefined.*count === null/s);
  });

  it('counts products by qty !== 0 (regression guard, ETP-4528: keeps negative/shrinkage stock in the count)', () => {
    // aggregateProducts no longer filters internally, so this cell must apply its own
    // non-zero predicate (matching the Products tab), not the KPI's strict-positive one.
    assert.match(src, /aggregateProducts\(allContents\)\.filter\(p => p\.qty !== 0\)\.length/);
  });

  it('does not use the strict-positive KPI predicate for the product count', () => {
    assert.doesNotMatch(src, /aggregateProducts\(allContents\)\.filter\(p => p\.qty > 0\)/);
  });
});
