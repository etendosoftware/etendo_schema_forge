import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  NEEDS_PRIMARY_DOC,
  NEEDS_INVOICE_DOC,
  readAnnotatedFlag,
  readOrderPendingDocs,
} from '../orderPendingDocs.js';

// ETP-5295 — this module is the single frontend reader for the two backend GET annotations
// (`needsPrimaryDoc` / `needsInvoiceDoc`) that decide whether an order still needs a
// shipment/receipt and/or an invoice. Three surfaces read it — the list row kebab
// (`useOrderWindow.jsx`), the detail-page topbar button and the row-kebab `ManageDocsLauncher`
// (both in `OrderCreateInvoice.jsx` / `PurchaseOrderActions.jsx`) — so its two contracts below are
// load-bearing for all of them:
//
//   1. `'N'` must read as FALSE. An Etendo boolean crosses the wire either as a real JSON boolean
//      or as the AD `'Y'`/`'N'` string. A plain `!!value` reads the non-empty string `'N'` as
//      TRUE, which would show a "Gestionar" entry for an order with nothing left to manage — the
//      exact class of bug this ticket removed, just re-introduced one layer lower.
//   2. An ABSENT annotation must read as `undefined`, not `false`. The callers distinguish the
//      two with `??`: `undefined` falls through to their own local derivation (the detail page
//      has really fetched the shipments/invoices/lines, so it can still answer), while `false`
//      is the server's answer and must win. A reader that collapsed absent into `false` would
//      silently disable every fallback path.
describe('orderPendingDocs', () => {
  describe('exported annotation names', () => {
    // These two strings are the wire contract with `AbstractOrderHeaderHandler.afterHandle()`.
    // They are asserted literally because a rename on either side is otherwise undetectable:
    // the reader would just return `undefined` for every record and every manage entry would
    // quietly disappear from the list kebab.
    it('matches the backend spelling of the two GET annotations', () => {
      assert.equal(NEEDS_PRIMARY_DOC, 'needsPrimaryDoc');
      assert.equal(NEEDS_INVOICE_DOC, 'needsInvoiceDoc');
    });
  });

  describe('readAnnotatedFlag', () => {
    it('reads the JSON boolean true as true', () => {
      assert.equal(readAnnotatedFlag(true), true);
    });

    it('reads the JSON boolean false as false', () => {
      assert.equal(readAnnotatedFlag(false), false);
    });

    it("reads the AD string 'Y' as true", () => {
      assert.equal(readAnnotatedFlag('Y'), true);
    });

    it("reads the AD string 'N' as FALSE — a plain !! would read it true", () => {
      assert.equal(readAnnotatedFlag('N'), false);
      // Pin the contrast explicitly: this is the whole reason the helper exists.
      assert.notEqual(readAnnotatedFlag('N'), !!'N');
    });

    it('returns undefined (not false) for an absent annotation', () => {
      assert.equal(readAnnotatedFlag(undefined), undefined);
    });

    it('returns undefined for null', () => {
      assert.equal(readAnnotatedFlag(null), undefined);
    });

    // Anything outside the four recognised forms is treated as "no answer" rather than guessed
    // at, so the caller's `??` fallback engages instead of a coin-flip coercion.
    for (const [caseName, value] of [
      ['the empty string', ''],
      ['a lowercase y', 'y'],
      ['a lowercase n', 'n'],
      ['the string "true"', 'true'],
      ['the string "false"', 'false'],
      ['the number 1', 1],
      ['the number 0', 0],
      ['an object', {}],
      ['an array', []],
    ]) {
      it(`returns undefined for an unexpected value: ${caseName}`, () => {
        assert.equal(readAnnotatedFlag(value), undefined);
      });
    }
  });

  describe('readOrderPendingDocs', () => {
    it('reads both annotations off an annotated record', () => {
      assert.deepEqual(
        readOrderPendingDocs({ needsPrimaryDoc: true, needsInvoiceDoc: false }),
        { needsPrimaryDoc: true, needsInvoiceDoc: false },
      );
    });

    it('reads both annotations in their AD string form', () => {
      assert.deepEqual(
        readOrderPendingDocs({ needsPrimaryDoc: 'N', needsInvoiceDoc: 'Y' }),
        { needsPrimaryDoc: false, needsInvoiceDoc: true },
      );
    });

    it('reads the two flags independently (one annotated, one absent)', () => {
      assert.deepEqual(
        readOrderPendingDocs({ needsPrimaryDoc: true }),
        { needsPrimaryDoc: true, needsInvoiceDoc: undefined },
      );
    });

    it('returns both flags undefined for an unannotated record (legacy backend)', () => {
      assert.deepEqual(
        readOrderPendingDocs({ id: 'ORD-1', documentStatus: 'CO', grandTotalAmount: 100 }),
        { needsPrimaryDoc: undefined, needsInvoiceDoc: undefined },
      );
    });

    it('returns both flags undefined for an empty record', () => {
      assert.deepEqual(
        readOrderPendingDocs({}),
        { needsPrimaryDoc: undefined, needsInvoiceDoc: undefined },
      );
    });

    // The launcher derives from `data` before its own fetch resolves and the kebab may be handed
    // a row mid-refresh, so a missing record must not throw.
    it('does not throw for undefined', () => {
      assert.deepEqual(
        readOrderPendingDocs(undefined),
        { needsPrimaryDoc: undefined, needsInvoiceDoc: undefined },
      );
    });

    it('does not throw for null', () => {
      assert.deepEqual(
        readOrderPendingDocs(null),
        { needsPrimaryDoc: undefined, needsInvoiceDoc: undefined },
      );
    });

    it('always returns both keys, so destructuring never yields a missing binding', () => {
      assert.deepEqual(Object.keys(readOrderPendingDocs(null)).sort(), ['needsInvoiceDoc', 'needsPrimaryDoc']);
    });

    it('reads the keys named by the exported constants', () => {
      const record = { [NEEDS_PRIMARY_DOC]: 'Y', [NEEDS_INVOICE_DOC]: 'Y' };
      assert.deepEqual(readOrderPendingDocs(record), { needsPrimaryDoc: true, needsInvoiceDoc: true });
    });
  });
});
