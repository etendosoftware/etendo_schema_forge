import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsReceiptDraftChips.jsx'), 'utf8');

describe('GoodsReceiptDraftChips', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function GoodsReceiptDraftChips/);
  });

  it('uses useUI from @/i18n', () => {
    assert.match(src, /import\s*\{[^}]*useUI[^}]*\}\s*from\s*['"]@\/i18n['"]/);
  });

  it('delegates to the shared ProgressFieldBadge', () => {
    assert.match(src, /import ProgressFieldBadge from '@\/windows\/custom\/shared\/ProgressFieldBadge'/);
    assert.match(src, /<ProgressFieldBadge/);
  });

  it('gates on documentStatus and reads invoiceStatus', () => {
    assert.match(src, /documentStatus=\{data\?\.documentStatus\}/);
    assert.match(src, /value=\{data\?\.invoiceStatus\}/);
  });

  it('labels via ui("poAllInvoiced")', () => {
    assert.match(src, /label=\{ui\(['"]poAllInvoiced['"]\)\}/);
  });

  it('opts in to showWhenPositive so drafts already invoiced show the badge', () => {
    assert.match(src, /<ProgressFieldBadge[^>]*\sshowWhenPositive(\s|\/|>)/s);
  });

  it('keeps the goods-receipt-invoice-badge testId', () => {
    assert.match(src, /testId="goods-receipt-invoice-badge"/);
  });

  it('does not duplicate pill/tone logic', () => {
    assert.doesNotMatch(src, /DocumentStatusPill|getProgressTone|TONE_STYLES|Math\.round/);
  });
});
