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

  it('accepts quotationId, data, token, apiBaseUrl, onClose props', () => {
    assert.match(src, /quotationId.*token.*apiBaseUrl.*onClose/s);
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

    it('computes grandTotal as grossBase directly, not totalLines + a re-derived tax delta (ETP-5132 double-discount fix, supersedes ETP-4017)', () => {
      // ETP-5132 (confirm-modal double-discount regression — see
      // docs/bug-reports/2026-09-09-etp5132-confirm-modal-double-discount.md):
      // grossBase (d.grandTotalAmount) is ALREADY GET-time-compensated for a
      // pending total discount by the backend (ETP-4029) whenever the
      // quotation is in DR (SendToEvaluationModal always runs pre-completion,
      // per ETP-4006). The old ETP-4017 formula re-applied discountFactor on
      // top of that already-discounted value, double-discounting the tax
      // portion on EVERY send-to-evaluation with an active total discount
      // (discountFactor here is unconditional, unlike the order/PO modals).
      // totalLines (the Subtotal row) still needs the client-side factor —
      // netBase/summedLineAmount is never backend-compensated — only the
      // grandTotal (Total row) computation itself changes.
      assert.match(src, /const round2\s*=\s*\(n\) => Math\.round\(\(n \+ Number\.EPSILON\) \* 100\) \/ 100/);
      assert.match(src, /const grossBase\s*=\s*Number\(d\.grandTotalAmount \?\? d\.grandTotal \?\? 0\) \|\| 0/);
      assert.match(src, /const netBase\s*=\s*Number\(d\.summedLineAmount \?\? d\.totalLines \?\? grossBase\) \|\| 0/);
      assert.match(src, /const totalLines\s*=\s*round2\(netBase \* discountFactor\)/);
      assert.match(src, /const grandTotal\s*=\s*grossBase;/);
      assert.doesNotMatch(
        src,
        /const grandTotal\s*=\s*totalLines \+ round2\(\(grossBase - netBase\) \* discountFactor\)/,
        'the superseded ETP-4017 formula must not be reintroduced — it double-discounts grossBase',
      );
    });
  });

  // ETP-5132 — proves the double-discount fix with concrete numbers, not just
  // the literal-formula regex above. Extracts the REAL totals computation
  // block from the live source (not a hand-copied re-implementation) and
  // executes it via `new Function(...)`, so this test tracks the actual
  // arithmetic and fails if the double-discount regression is reintroduced.
  describe('grandTotal numeric proof (ETP-5132 double-discount fix)', () => {
    function extractTotalsBlock(source) {
      const re = /const discountPct[\s\S]*?const grandTotal\s*=\s*grossBase;/;
      const m = source.match(re);
      assert.ok(m, 'could not locate the totals computation block (const discountPct … const grandTotal = grossBase;)');
      return m[0];
    }

    function evaluate(d) {
      const block = extractTotalsBlock(src);
      // eslint-disable-next-line no-new-func -- deliberately eval'ing the literal source under test
      const fn = new Function('d', `${block}\nreturn { discountFactor, totalLines, grandTotal };`);
      return fn(d);
    }

    it('does not double-discount a Draft quotation whose grandTotalAmount is already GET-time-compensated (ETP-5132)', () => {
      // grossBase simulates ETP-4029's equivalent GET-time compensation for
      // invoices: the backend already applied the pending 10% total discount
      // to grandTotalAmount (100 -> 90). netBase (summedLineAmount) simulates
      // the raw, never-backend-compensated line total (100).
      const { discountFactor, totalLines, grandTotal } = evaluate({
        etgoTotalDiscount: 10,
        grandTotalAmount: 90,
        summedLineAmount: 100,
      });
      assert.equal(discountFactor, 0.9);
      assert.equal(totalLines, 90, 'Subtotal row still applies the client-side factor to the raw netBase');
      assert.equal(grandTotal, 90, 'Total row must equal grossBase as-is — not double-discounted');
      // Regression guard: the superseded ETP-4017 formula would have produced
      // 81 (90 + round2((90 - 100) * 0.9) = 90 - 9 = 81), silently discounting
      // the already-compensated grossBase a second time.
      assert.notEqual(grandTotal, 81);
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
