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

  it('uses the shared progress-tone helper for badge color', () => {
    assert.match(src, /from '@\/lib\/progressTone'/);
    assert.match(src, /getProgressTone/);
  });

  it('renders the progress chip through DocumentStatusPill (single text layer)', () => {
    assert.match(src, /import DocumentStatusPill from '@\/components\/contract-ui\/DocumentStatusPill'/);
    assert.match(src, /<DocumentStatusPill/);
    assert.match(src, /showIcon=\{false}/);
    assert.match(src, /tone=\{getProgressTone\(pct\)}/);
    assert.match(src, /label=\{`\$\{label} \$\{percent}%`}/);
    assert.match(src, /testId="order-progress-badge"/);
    assert.doesNotMatch(src, /TONE_STYLES/);
    assert.doesNotMatch(src, /tabular-nums/);
  });

  it('computes receivedPct from order-line quantities', () => {
    assert.match(src, /qtyOrdered > 0 \? qtyDelivered \/ qtyOrdered : 0/);
  });

  it('computes invoicedPct from grand totals', () => {
    assert.match(src, /totalOrder > 0 \? totalInvoiced \/ totalOrder : 0/);
  });

  it('renders Received and Invoiced progress badges unconditionally when state is loaded', () => {
    assert.match(src, /<ProgressBadge[^>]*poAllReceived[^>]*pct=\{receivedPct\}/s);
    assert.match(src, /<ProgressBadge[^>]*poAllInvoiced[^>]*pct=\{invoicedPct\}/s);
  });

  it('does not render draft navigation pills (related docs panel covers it)', () => {
    assert.doesNotMatch(src, /<DraftPill/);
    assert.doesNotMatch(src, /goods-receipt/);
  });

  it('drops the legacy CompletionBadge gray-only treatment', () => {
    assert.doesNotMatch(src, /CompletionBadge/);
    assert.doesNotMatch(src, /background:\s*'#F3F4F6'/);
  });

  it('renders the rounded integer percent in the badge', () => {
    assert.match(src, /Math\.round\(safePct \* 100\)/);
    assert.match(src, /\{percent\}%/);
  });

  it('clamps the percentage to the 0..1 range before rendering', () => {
    assert.match(src, /Math\.max\(0,\s*Math\.min\(1,\s*pct\)\)/);
  });
});
