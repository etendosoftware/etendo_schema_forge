import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getInvoiceDraftMode, buildInvoiceRowQuickActions } from '../useInvoiceWindow.js';

const src = readFileSync(new URL('../useInvoiceWindow.js', import.meta.url), 'utf8');

const fakeUi = (key) => `__${key}__`;

describe('useInvoiceWindow', () => {
  describe('getInvoiceDraftMode', () => {
    it('is enabled', () => {
      assert.equal(getInvoiceDraftMode(fakeUi).enabled, true);
    });

    it('uses documentAction as processField', () => {
      assert.equal(getInvoiceDraftMode(fakeUi).processField, 'documentAction');
    });

    it('uses CO as processValue', () => {
      assert.equal(getInvoiceDraftMode(fakeUi).processValue, 'CO');
    });

    it('disables when the document has no lines', () => {
      assert.equal(getInvoiceDraftMode(fakeUi).disableWhenEmpty, true);
    });

    it('resolves the label via the ui() translator', () => {
      assert.equal(getInvoiceDraftMode(fakeUi).label, '__confirm__');
    });

    describe('processingModal (Verifactu ~8s GenerateRF loading modal)', () => {
      it('returns a processingModal with the i18n-resolved body when showVerifactuProcessingModal is true', () => {
        const draftMode = getInvoiceDraftMode(fakeUi, { showVerifactuProcessingModal: true });
        assert.deepEqual(draftMode.processingModal, { body: '__fiscal.verifactu.processing.body__' });
      });

      it('returns processingModal: null when showVerifactuProcessingModal is explicitly false', () => {
        const draftMode = getInvoiceDraftMode(fakeUi, { showVerifactuProcessingModal: false });
        assert.equal(draftMode.processingModal, null);
      });

      it('returns processingModal: null when called with no options arg (existing purchase-invoice call shape)', () => {
        const draftMode = getInvoiceDraftMode(fakeUi);
        assert.equal(draftMode.processingModal, null);
      });
    });
  });

  describe('buildInvoiceRowQuickActions', () => {
    it('returns all four actions enabled', () => {
      const result = buildInvoiceRowQuickActions(() => {}, 'test', () => {}, () => {}, () => {});
      assert.equal(result.actions.edit.show, true);
      assert.equal(result.actions.duplicate.show, true);
      assert.equal(result.actions.email.show, true);
      assert.equal(result.actions.delete.show, true);
    });

    it('sets editMode to navigate and enables documentPreview', () => {
      const result = buildInvoiceRowQuickActions(() => {}, 'test', () => {}, () => {}, () => {});
      assert.equal(result.editMode, 'navigate');
      assert.equal(result.documentPreview, true);
    });

    it('onEdit navigates to the correct window path', () => {
      const calls = [];
      const navigate = (path) => calls.push(path);
      const result = buildInvoiceRowQuickActions(navigate, 'purchase-invoice', () => {}, () => {}, () => {});
      result.onEdit({ id: '42' });
      assert.equal(calls[0], '/purchase-invoice/42');
    });

    it('onClone wraps a single row in an array', () => {
      const captured = [];
      const setCloneTargets = (v) => captured.push(v);
      const result = buildInvoiceRowQuickActions(() => {}, 'x', setCloneTargets, () => {}, () => {});
      result.onClone({ id: 'r1' });
      assert.deepEqual(captured[0], [{ id: 'r1' }]);
    });

    it('onEmail forwards the row to setEmailRow', () => {
      const captured = [];
      const setEmailRow = (row) => captured.push(row);
      const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, setEmailRow, () => {});
      result.onEmail({ id: 'r2' });
      assert.deepEqual(captured[0], { id: 'r2' });
    });

    it('onDelete is the requestDelete function itself', () => {
      const requestDelete = () => {};
      const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, requestDelete);
      assert.equal(result.onDelete, requestDelete);
    });

    it('hides the email action when options.showEmail is false', () => {
      const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {}, { showEmail: false });
      assert.equal(result.actions.email.show, false);
      assert.equal(result.onEmail, undefined);
    });

    it('accepts null as setEmailRow when showEmail is false (no ReferenceError)', () => {
      const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, null, () => {}, { showEmail: false });
      assert.equal(result.onEmail, undefined);
    });

    // ETP-4717 — this function builds rowQuickActions by hand (bypassing the
    // generated contract's rowQuickActions.actions.email.visibleWhen), so the
    // gate must be asserted here directly. Regression: without it, the Grid
    // "Enviar" (email) quick action shows on every row regardless of status.
    it('gates the row-hover email quick action to Confirmed invoices (CO) when showEmail is true (default, sales-invoice)', () => {
      const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});
      assert.equal(result.actions.email.visibleWhen, "@DocumentStatus@='CO'");
    });

    it('does not set visibleWhen on the email action when showEmail is false (purchase-invoice stays unaffected)', () => {
      const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {}, { showEmail: false });
      assert.equal('visibleWhen' in result.actions.email, false);
    });

    // ETP-5209 — Post reachable from the row-hover kebab, gated the same way as
    // the form-view kebab (decisions.json -> window.menuActions) and the bulk
    // Post action (BulkDocumentAction.jsx's buildPostActions/postRowFilter):
    // a row must be processed AND not yet posted for Post to appear.
    describe('menuActions (ETP-5209 — row-hover Post entry)', () => {
      it('offers post when the row is processed and not posted', () => {
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});
        const actions = result.menuActions({ row: { processed: 'Y', posted: 'N' } });
        assert.deepEqual(actions, [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }]);
      });

      it('returns no actions when the row is already posted', () => {
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});
        const actions = result.menuActions({ row: { processed: 'Y', posted: 'Y' } });
        assert.deepEqual(actions, []);
      });

      it('returns no actions when the row is not processed yet', () => {
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});
        const actions = result.menuActions({ row: { processed: 'N', posted: 'N' } });
        assert.deepEqual(actions, []);
      });

      it('treats boolean true the same as Y for both posted and processed', () => {
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});
        assert.deepEqual(
          result.menuActions({ row: { processed: true, posted: false } }),
          [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }],
        );
        assert.deepEqual(result.menuActions({ row: { processed: true, posted: true } }), []);
      });

      it('handles a missing/undefined row without throwing (returns no actions)', () => {
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});
        assert.deepEqual(result.menuActions({}), []);
      });
    });

    describe('onMenuActionExecuted / onRefresh (ETP-5209)', () => {
      it('calls the onRefresh option when a neoAction menu action completes', () => {
        let refreshCalls = 0;
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {}, {
          onRefresh: () => { refreshCalls += 1; },
        });
        result.onMenuActionExecuted({ neoAction: 'post' });
        assert.equal(refreshCalls, 1);
      });

      it('does not call onRefresh for a menu action without a neoAction', () => {
        let refreshCalls = 0;
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {}, {
          onRefresh: () => { refreshCalls += 1; },
        });
        result.onMenuActionExecuted({ key: 'someOtherAction' });
        assert.equal(refreshCalls, 0);
      });

      it('does not throw when onRefresh is not provided (optional chaining)', () => {
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});
        assert.doesNotThrow(() => result.onMenuActionExecuted({ neoAction: 'post' }));
      });
    });
  });

  describe('useClearSavedRecord (source shape)', () => {
    it('is exported as a named hook', () => {
      assert.match(src, /export function useClearSavedRecord/);
    });

    it('calls setSavedRecord(null) to reset state', () => {
      assert.match(src, /setSavedRecord\(null\)/);
    });

    it('navigates with replace:true to clear the browser history state', () => {
      assert.match(src, /location\.state\?\.savedRecord/);
      assert.match(src, /replace: true/);
    });
  });
});
