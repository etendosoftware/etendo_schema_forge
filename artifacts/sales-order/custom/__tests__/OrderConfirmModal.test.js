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

    /**
     * ETP-4767 asked one thing of the document-status badge: its colours must come from
     * the semantic status ROLE tokens, never from a hardcoded hex or a raw palette value.
     *
     * ETP-5381 gave the badge two branches — an auto-generated invoice arrives confirmed
     * while the shipment beside it is still a draft — so a single literal-string match no
     * longer describes the component. Rather than match two literals (which would accept
     * an INVERTED mapping, success-on-draft, just as happily), the tone expression is
     * lifted out of the source and EXECUTED, the same technique the ETP-4888 block below
     * uses for `rawMsg`. That pins the actual status→role mapping, and asserting the token
     * SHAPE on the evaluated values is what keeps a hardcoded colour out of either branch.
     *
     * A render test of DocPill was considered and rejected: DocPill is not exported, so
     * reaching it means mounting the whole modal and driving it through handleConfirm with
     * fetch, the two action responses and the portal mocked — a large surface for one
     * assertion, and it would need a source change (exporting DocPill) that a test has no
     * business asking for.
     */
    function getRealToneResolver() {
      const match = src.match(/const confirmed = ([\s\S]*?);\s*const tone = ([\s\S]*?);/);
      assert.ok(match, 'could not locate the confirmed/tone expressions in OrderConfirmModal.jsx');
      return new Function(
        'documentStatus',
        `const confirmed = ${match[1]}; const tone = ${match[2]}; return tone;`,
      );
    }

    const STATUS_ROLE_TOKEN = /^var\(--status-(success|warning|info|destructive)-(bg|fg)\)$/;

    it('drives the document-status badge from the semantic role tokens, not a literal colour', () => {
      const tone = getRealToneResolver();
      for (const status of ['CO', 'DR', null, undefined]) {
        const { bg, fg } = tone(status);
        assert.match(bg, STATUS_ROLE_TOKEN,
          `background for documentStatus=${status} must be a semantic status role token, got ${bg}`);
        assert.match(fg, STATUS_ROLE_TOKEN,
          `color for documentStatus=${status} must be a semantic status role token, got ${fg}`);
      }
      // The badge must consume the resolved tone rather than re-deciding a colour inline.
      assert.match(src, /background: tone\.bg, color: tone\.fg/);
    });

    it('uses the success role for a confirmed document and the warning role for a draft (ETP-5381)', () => {
      const tone = getRealToneResolver();

      assert.deepEqual(tone('CO'), {
        bg: 'var(--status-success-bg)',
        fg: 'var(--status-success-fg)',
      }, 'a confirmed document must read as success, not as a draft');

      const draft = {
        bg: 'var(--status-warning-bg)',
        fg: 'var(--status-warning-fg)',
      };
      assert.deepEqual(tone('DR'), draft);
      // Anything that is not explicitly confirmed stays on the draft tone — a missing
      // documentStatus must never be optimistically badged as completed.
      assert.deepEqual(tone(null), draft);
      assert.deepEqual(tone(undefined), draft);
    });

    it('labels the badge from the same confirmed/draft decision as the colour', () => {
      assert.match(src, /ui\(confirmed \? 'statusCompleted' : 'statusDraft'\)/);
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
