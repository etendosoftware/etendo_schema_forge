import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OrderConfirmModal.jsx'), 'utf8');

describe('OrderConfirmModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function OrderConfirmModal/);
  });

  it('uses the useUI() hook for translations', () => {
    assert.match(src, /from\s+['"]@\/i18n['"]/);
    assert.match(src, /useUI\(\)/);
  });

  // ETP-4312: the arrow on each "view document" button comes from code (a literal
  // " →" glyph appended after the {ui(...)} label in JSX), never from the label.
  describe('view-document button arrows (ETP-4312)', () => {
    it('renders soViewShipment label followed by a literal " →" glyph', () => {
      assert.match(src, /\{ui\('soViewShipment'\)\}\s*→/);
    });

    it('renders soViewInvoice label followed by a literal " →" glyph', () => {
      assert.match(src, /\{ui\('soViewInvoice'\)\}\s*→/);
    });
  });

  describe('semantic color roles (ETP-4767)', () => {
    it('keeps the selected option and primary action readable', () => {
      assert.match(src, /background: checked \? 'var\(--status-info-bg\)' : 'hsl\(var\(--card\)\)'/);
      assert.match(src, /background: 'var\(--status-info-fg\)', color: 'hsl\(var\(--card\)\)'/);
    });

    it('uses the warning foreground for document-status text', () => {
      assert.match(src, /background: 'var\(--status-warning-bg\)', color: 'var\(--status-warning-fg\)'/);
    });
  });

  // ETP-4888 — commit 2ccdf7097 added a flat `err?.message` fallback to the
  // DocAction (step 1) error-message extraction, matching the pattern steps
  // 2/3 already had. A business-rule rejection (e.g. C_Order_Post) returns a
  // FLAT `{ status, message }` body — no `error`/`response` wrapper — and
  // before the fix that shape fell straight through to the generic
  // "Process failed (400)" message, silently hiding the real Spanish reason
  // from the user. This block extracts the REAL fallback expression from the
  // live source (not a hand-copied duplicate) and executes it, so reverting
  // the fix (dropping `|| err?.message`) fails this test.
  describe('DocAction confirm error message — no silent generic fallback (ETP-4888)', () => {
    function getRealRawMsgResolver() {
      const match = src.match(/const rawMsg = ([\s\S]*?);/);
      assert.ok(match, 'could not locate the rawMsg fallback expression in OrderConfirmModal.jsx');
      return new Function('err', 'processRes', `return ${match[1]};`);
    }

    it('resolves the real backend message for a flat {status,message} 400 body (no error/response wrapper)', () => {
      // This is the exact shape the real backend returns for a C_Order_Post
      // business-rule rejection.
      const resolve = getRealRawMsgResolver();
      const err = { status: 'error', message: 'El pedido no puede confirmarse: falta el almacén' };
      assert.equal(resolve(err, { status: 400 }), 'El pedido no puede confirmarse: falta el almacén');
    });

    it('does not fall back to the generic "Process failed (400)" message when a flat message is present', () => {
      const resolve = getRealRawMsgResolver();
      const err = { status: 'error', message: 'Real business-rule message' };
      assert.notEqual(resolve(err, { status: 400 }), 'Process failed (400)');
    });

    it('still falls back to "Process failed (status)" when the body has no message at all', () => {
      const resolve = getRealRawMsgResolver();
      assert.equal(resolve(null, { status: 500 }), 'Process failed (500)');
      assert.equal(resolve({}, { status: 500 }), 'Process failed (500)');
    });

    it('keeps preferring the nested err.error.message over the flat err.message (guard-clause shape)', () => {
      // Some server-side guard clauses (missing mandatory param, unmet
      // precondition, access denied) nest the message under `error.message`
      // instead of the flat `message` a business-rule rejection returns.
      const resolve = getRealRawMsgResolver();
      const err = { error: { message: 'Nested guard-clause message' }, message: 'Flat message' };
      assert.equal(resolve(err, { status: 400 }), 'Nested guard-clause message');
    });

    it('keeps preferring err.response.message over the flat err.message', () => {
      const resolve = getRealRawMsgResolver();
      const err = { response: { message: 'Nested response message' }, message: 'Flat message' };
      assert.equal(resolve(err, { status: 400 }), 'Nested response message');
    });
  });
});
