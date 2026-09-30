import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ReturnToVendorShipmentInvoicedBadge.jsx'), 'utf8');

describe('ReturnToVendorShipmentInvoicedBadge', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ReturnToVendorShipmentInvoicedBadge/);
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

  it('reads the invoiceStatus field', () => {
    assert.match(src, /value=\{data\?\.invoiceStatus\}/);
  });

  it('labels via ui("invoiced") without hardcoded strings', () => {
    assert.match(src, /label=\{ui\(['"]invoiced['"]\)\}/);
  });

  it('keeps the billing-badge testId', () => {
    assert.match(src, /testId="billing-badge"/);
  });

  it('does not duplicate pill/tone logic', () => {
    assert.doesNotMatch(src, /DocumentStatusPill|getProgressTone|TONE_STYLES/);
  });
});
