import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseInvoiceTopbar.jsx'), 'utf8');

describe('PurchaseInvoiceTopbar', () => {
  it('opens InvoicePaymentHistoryModal without passing a token prop', () => {
    const modalBlock = src.match(/<InvoicePaymentHistoryModal[\s\S]*?\/>/);
    assert.ok(modalBlock, 'expected InvoicePaymentHistoryModal to be rendered');
    assert.doesNotMatch(modalBlock[0], /token=\{token\}/);
  });

  it('calls onRefresh (not window.location.reload) for invoice-updated and modal close', () => {
    assert.match(src, /onRefresh\?\.\(\)/, 'expected onRefresh?.() call');
    assert.doesNotMatch(src, /window\.location\.reload\(\)/, 'expected no window.location.reload()');
  });
});
