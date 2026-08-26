import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SendToEvaluationModal.jsx'), 'utf8');

describe('SendToEvaluationModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SendToEvaluationModal/);
  });

  it('accepts quotationId, data, apiBaseUrl, onClose props', () => {
    // ETP-4576 — `token` was in this list. The credential is not threaded through
    // props any more: the header builders resolve it, so a call site that cannot
    // pass one cannot pass the wrong one.
    assert.match(src, /quotationId.*apiBaseUrl.*onClose/s);
  });

  it('POSTs to DocAction endpoint on confirm', () => {
    assert.match(src, /action\/DocAction/);
    assert.match(src, /method.*POST/s);
  });

  it('calls window.location.reload after successful confirm', () => {
    assert.match(src, /window\.location\.reload/);
  });

  it('calls onClose after successful confirm', () => {
    assert.match(src, /onClose\(\)/);
  });

  it('renders sqSendToEvalTitle i18n key', () => {
    assert.match(src, /sqSendToEvalTitle/);
  });

  it('renders sqSendToEvalDesc i18n key', () => {
    assert.match(src, /sqSendToEvalDesc/);
  });

  it('renders sqSendToEvalConfirm i18n key on confirm button', () => {
    assert.match(src, /sqSendToEvalConfirm/);
  });

  it('fetches fresh record and line count on mount', () => {
    assert.match(src, /quotationLine\?parentId/);
    assert.match(src, /useEffect/);
  });

  describe('draft total-discount preview (ETP-4006)', () => {
    it('derives a discountFactor from etgoTotalDiscount on draft quotations', () => {
      assert.match(src, /const discountPct\s*=\s*Number\(d\.etgoTotalDiscount \?\? 0\)/);
      assert.match(src, /const discountFactor\s*=\s*discountPct > 0 \? \(1 - discountPct \/ 100\) : 1/);
    });

    it('computes grandTotal as round(net × factor) + round(tax × factor), not round(gross × factor) (ETP-4017)', () => {
      // Anti-double-rounding rule: see DocumentTotalsPanel / documentTotals.js.
      // The displayed total must equal sum of displayed components so it agrees
      // with the quotation's right panel and with AEAT-compliant printed invoices.
      assert.match(src, /const round2\s*=\s*\(n\) => Math\.round\(\(n \+ Number\.EPSILON\) \* 100\) \/ 100/);
      assert.match(src, /const grossBase\s*=\s*Number\(d\.grandTotalAmount \?\? d\.grandTotal \?\? 0\) \|\| 0/);
      assert.match(src, /const netBase\s*=\s*Number\(d\.summedLineAmount \?\? d\.totalLines \?\? grossBase\) \|\| 0/);
      assert.match(src, /const totalLines\s*=\s*round2\(netBase \* discountFactor\)/);
      assert.match(src, /const grandTotal\s*=\s*totalLines \+ round2\(\(grossBase - netBase\) \* discountFactor\)/);
    });
  });

  it('shows loading spinner while processing', () => {
    assert.match(src, /soProcessing/);
    assert.match(src, /loading/);
  });

  it('displays error message on failure', () => {
    assert.match(src, /setError/);
    assert.match(src, /soErrorOccurred/);
  });

  it('has cancel button that calls onClose', () => {
    assert.match(src, /ui\('cancel'\)/);
  });
});
