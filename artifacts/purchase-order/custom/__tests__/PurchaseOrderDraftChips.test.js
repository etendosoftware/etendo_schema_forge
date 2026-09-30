import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseOrderDraftChips.jsx'), 'utf8');

describe('PurchaseOrderDraftChips', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function PurchaseOrderDraftChips/);
  });

  it('only renders when the order is in CO status', () => {
    assert.match(src, /documentStatus === 'CO'/);
  });

  it('delegates the progress badge to the shared ProgressFieldBadge', () => {
    assert.match(src, /import ProgressFieldBadge from '@\/windows\/custom\/shared\/ProgressFieldBadge'/);
    assert.equal((src.match(/<ProgressFieldBadge/g) || []).length, 2);
    assert.match(src, /documentStatus=\{data\?\.documentStatus}/);
    assert.equal((src.match(/testId="order-progress-badge"/g) || []).length, 2);
  });

  it('no longer owns tone, rounding or clamping logic (lives in ProgressFieldBadge)', () => {
    assert.doesNotMatch(src, /function ProgressBadge|<ProgressBadge/);
    assert.doesNotMatch(src, /DocumentStatusPill/);
    assert.doesNotMatch(src, /getProgressTone|progressTone/);
    assert.doesNotMatch(src, /Math\.round/);
    assert.doesNotMatch(src, /Math\.max\(0,\s*Math\.min/);
    assert.doesNotMatch(src, /TONE_STYLES/);
  });

  it('computes receivedPct from order-line quantities', () => {
    assert.match(src, /qtyOrdered > 0 \? qtyDelivered \/ qtyOrdered : 0/);
  });

  it('computes invoicedPct from grand totals', () => {
    assert.match(src, /totalOrder > 0 \? totalInvoiced \/ totalOrder : 0/);
  });

  it('renders Received and Invoiced progress badges when state is loaded', () => {
    assert.match(src, /<ProgressFieldBadge[^>]*value=\{Number\.isFinite\(receivedPct\) \? receivedPct \* 100 : 0}[^>]*label=\{ui\('poAllReceived'\)}/s);
    assert.match(src, /<ProgressFieldBadge[^>]*value=\{Number\.isFinite\(invoicedPct\) \? invoicedPct \* 100 : 0}[^>]*label=\{ui\('poAllInvoiced'\)}/s);
  });

  it('does not render draft navigation pills (related docs panel covers it)', () => {
    assert.doesNotMatch(src, /<DraftPill/);
    assert.doesNotMatch(src, /goods-receipt/);
  });

  it('drops the legacy CompletionBadge gray-only treatment', () => {
    assert.doesNotMatch(src, /CompletionBadge/);
    assert.doesNotMatch(src, /background:\s*'#F3F4F6'/);
  });
});
