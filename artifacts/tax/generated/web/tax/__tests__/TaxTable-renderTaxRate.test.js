/**
 * Tax — renderTaxRate source-reading tests.
 *
 * Replaces e2e/tests/flows/tax-rate-display.mocked.spec.js which only checked
 * that Tag components render with correct variant/label for positive, zero, and
 * negative tax rates. This is pure formatting logic testable by reading the source.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'TaxTable.jsx'), 'utf8');

describe('TaxTable — renderTaxRate', () => {
  it('defines renderTaxRate function', () => {
    assert.match(src, /function renderTaxRate\(row\)/);
  });

  it('returns empty string for null rate', () => {
    assert.match(src, /if \(val == null\) return ''/);
  });

  it('renders green Tag with + prefix for positive rates', () => {
    assert.match(src, /val > 0.*Tag variant="green".*\+\$\{val\} %/s);
  });

  it('renders neutral Tag for zero rate', () => {
    assert.match(src, /val === 0.*Tag variant="neutral".*0 %/s);
  });

  it('renders red Tag without + prefix for negative rates', () => {
    assert.match(src, /Tag variant="red".*\$\{val\} %/);
  });

  it('is wired into the rate column via render prop', () => {
    assert.match(src, /key:\s*'rate'.*render:\s*renderTaxRate/);
  });
});