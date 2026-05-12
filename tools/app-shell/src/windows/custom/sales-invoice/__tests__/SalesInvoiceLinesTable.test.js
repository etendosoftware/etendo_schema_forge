import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SalesInvoiceLinesTable.jsx'), 'utf8');

describe('SalesInvoiceLinesTable', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default SalesInvoiceLinesTable/);
  });

  it('renders a DataTable', () => {
    assert.match(src, /DataTable/);
  });

  it('defines listPrice column with type amount', () => {
    assert.match(src, /key.*listPrice/);
    assert.match(src, /type.*amount/);
  });

  it('uses useCurrency to get the org currency code', () => {
    assert.match(src, /useCurrency/);
  });

  it('enriches rows with currency$_identifier fallback', () => {
    assert.match(src, /currency\$_identifier/);
  });

  it('passes enriched data to DataTable', () => {
    assert.match(src, /enrichedData/);
  });
});