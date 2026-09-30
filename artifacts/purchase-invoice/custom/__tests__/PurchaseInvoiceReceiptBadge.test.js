import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseInvoiceReceiptBadge.jsx'), 'utf8');

describe('PurchaseInvoiceReceiptBadge', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function PurchaseInvoiceReceiptBadge/);
  });

  it('uses useUI from @/i18n', () => {
    assert.match(src, /import\s*\{[^}]*useUI[^}]*\}\s*from\s*['"]@\/i18n['"]/);
  });

  it('delegates to the shared ProgressFieldBadge', () => {
    assert.match(src, /import ProgressFieldBadge from '@\/windows\/custom\/shared\/ProgressFieldBadge'/);
    assert.match(src, /<ProgressFieldBadge/);
  });

  it('gates on documentStatus from data', () => {
    assert.match(src, /documentStatus=\{data\?\.documentStatus\}/);
  });

  it('reads the eTGODeliveryStatus field', () => {
    assert.match(src, /value=\{data\?\.eTGODeliveryStatus\}/);
  });

  it('labels via ui("poAllReceived") without hardcoded strings', () => {
    assert.match(src, /label=\{ui\(['"]poAllReceived['"]\)\}/);
  });

  it('keeps the receipt-badge testId', () => {
    assert.match(src, /testId="receipt-badge"/);
  });

  it('does not duplicate pill/tone logic', () => {
    assert.doesNotMatch(src, /DocumentStatusPill|getProgressTone|TONE_STYLES/);
  });
});
