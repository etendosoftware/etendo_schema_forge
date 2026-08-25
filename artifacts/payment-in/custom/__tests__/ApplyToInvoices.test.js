import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ApplyToInvoices.jsx'), 'utf8');

describe('ApplyToInvoices', () => {
  it('exports ApplyToInvoices as the default export', () => {
    assert.match(src, /export default function ApplyToInvoices/);
  });

  // ETP-4314: formatAmount() used to hardcode a CURRENCY_SYMBOLS map and place
  // the symbol BEFORE the amount ("€ 1,234.56") — the only symbol-before spot
  // in the whole app, and with no thousands grouping guarantee either. It must
  // now delegate entirely to the shared formatCurrency(), which places the
  // symbol after the amount (es-ES convention) with real Intl symbol lookup.
  it('delegates formatAmount entirely to the shared formatCurrency() (symbol after amount, no hardcoded map)', () => {
    assert.match(src, /import \{ formatCurrency \} from '@\/lib\/formatCurrency\.js';/);
    assert.match(
      src,
      /function formatAmount\(value, currency\) \{\s*\n\s*const num = [^\n]+;\s*\n\s*return formatCurrency\(currency, num\);\s*\n\s*\}/,
    );
  });

  it('no longer defines a hardcoded CURRENCY_SYMBOLS map or a symbol-before template', () => {
    assert.doesNotMatch(src, /CURRENCY_SYMBOLS/);
    // The old bug rendered the symbol first via a template like `${symbol} ${amount}`
    // ahead of the formatted number — no such symbol-then-number template remains.
    assert.doesNotMatch(src, /new Intl\.NumberFormat/);
  });

  it('uses formatAmount for every rendered money cell (read-only rows, editable-view rows, and the footer totals)', () => {
    assert.match(src, /\{formatAmount\(inv\.totalAmount, currency\)\}/);
    assert.match(src, /\{formatAmount\(inv\.outstandingAmount, currency\)\}/);
    assert.match(src, /\{formatAmount\(outstanding, currency\)\}/);
    assert.match(src, /\{formatAmount\(totalApplied, currency\)\}/);
    assert.match(src, /\{formatAmount\(paymentNum, currency\)\}/);
  });

  it("derives currency from the first pending invoice's own currency field", () => {
    assert.match(src, /const currency = invoices\[0\]\?\.currency \|\| '';/);
  });

  // ── ETP-4940 follow-up: save pending header edits before apply+process ────
  // This flow fires its own applyToInvoices + aPRMProcessPayment requests,
  // bypassing DetailView's guarded generic process button entirely — a header
  // edit made without clicking Save first was silently discarded.
  describe('ApplyToInvoices — save pending edits before apply+process (ETP-4940 follow-up)', () => {
    it('imports maybeSaveBeforeConfirm from detailViewHelpers', () => {
      assert.match(
        src,
        /import \{ maybeSaveBeforeConfirm \} from '@\/components\/contract-ui\/detailViewHelpers\.jsx'/,
      );
    });

    it('accepts onSave and isDirty props', () => {
      assert.match(src, /onSave,\s*\n\s*isDirty,/);
    });

    it('guards handleApplyAndProcess with maybeSaveBeforeConfirm before the apply/process fetch calls', () => {
      const fn = src.match(/const handleApplyAndProcess = useCallback\(async \(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/);
      assert.ok(fn, 'expected the handleApplyAndProcess callback');
      assert.match(
        fn[0],
        /if \(!\(await maybeSaveBeforeConfirm\(\{ isDirty, handleSave: onSave \}\)\)\) return;/,
      );
      // The guard must run before either fetch call, not after.
      const guardIdx = fn[0].indexOf('maybeSaveBeforeConfirm(');
      const applyIdx = fn[0].indexOf('action/applyToInvoices');
      assert.ok(guardIdx > -1 && applyIdx > -1 && guardIdx < applyIdx, 'guard must run before the applyToInvoices fetch');
    });

    it('includes onSave and isDirty in the handleApplyAndProcess dependency array', () => {
      const fn = src.match(/const handleApplyAndProcess = useCallback\(async \(\) => \{[\s\S]*?\}, \[([^\]]*)\]\);/);
      assert.ok(fn, 'expected the handleApplyAndProcess callback');
      assert.match(fn[1], /\bonSave\b/);
      assert.match(fn[1], /\bisDirty\b/);
    });
  });
});
