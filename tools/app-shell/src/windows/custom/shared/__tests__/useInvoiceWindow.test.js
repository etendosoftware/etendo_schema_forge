// @covers tools/app-shell/src/windows/custom/shared/useInvoiceWindow.js
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toast } from 'sonner';
import {
  getInvoiceDraftMode, buildInvoiceRowQuickActions, buildInvoiceUnpostActions, invoiceUnpostRowFilter,
} from '../useInvoiceWindow.js';

const src = readFileSync(new URL('../useInvoiceWindow.js', import.meta.url), 'utf8');

const fakeUi = (key) => `__${key}__`;

// ETP-5692 — the row-kebab Unpost entry, same shape as the albarán windows' one.
const UNPOST_ENTRY = {
  key: 'unpost',
  labelKey: 'unpost',
  neoAction: 'unpost',
  successKey: 'documentUnposted',
  destructive: true,
};

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

    describe('keepSaveWhenCompletedFields (ETP-4839 — purchase-invoice Save-when-completed override)', () => {
      it('omits keepSaveWhenCompletedFields entirely when called with no options arg (sales-invoice call shape)', () => {
        const draftMode = getInvoiceDraftMode(fakeUi);
        assert.equal('keepSaveWhenCompletedFields' in draftMode, false);
      });

      it('omits keepSaveWhenCompletedFields entirely when passed an empty array', () => {
        const draftMode = getInvoiceDraftMode(fakeUi, { keepSaveWhenCompletedFields: [] });
        assert.equal('keepSaveWhenCompletedFields' in draftMode, false);
      });

      it('sets keepSaveWhenCompletedFields to the given array when requested (purchase-invoice call shape)', () => {
        const draftMode = getInvoiceDraftMode(fakeUi, { keepSaveWhenCompletedFields: ['orderReference'] });
        assert.deepEqual(draftMode.keepSaveWhenCompletedFields, ['orderReference']);
      });

      it('is independent from showVerifactuProcessingModal — both options can be set together', () => {
        const draftMode = getInvoiceDraftMode(fakeUi, { keepSaveWhenCompletedFields: ['orderReference'], showVerifactuProcessingModal: true });
        assert.deepEqual(draftMode.keepSaveWhenCompletedFields, ['orderReference']);
        assert.deepEqual(draftMode.processingModal, { body: '__fiscal.verifactu.processing.body__' });
      });
    });

    // The post-Confirm hook (saveActions.jsx runAfterProcess) the invoice windows pass to
    // open the follow-up modal: forwarded only when it is a function, so every other caller
    // keeps a byte-identical draftMode.
    describe('afterProcess', () => {
      it('forwards a function as is', () => {
        const afterProcess = () => ({ stay: true });
        assert.equal(getInvoiceDraftMode(fakeUi, { afterProcess }).afterProcess, afterProcess);
      });

      for (const [name, options] of [
        ['no options arg', undefined],
        ['an undefined afterProcess', { afterProcess: undefined }],
        ['a non-function afterProcess', { afterProcess: { stay: true } }],
      ]) {
        it(`omits the key entirely with ${name}`, () => {
          assert.equal('afterProcess' in getInvoiceDraftMode(fakeUi, options), false);
        });
      }
    });

    // draftMode.editableLineFieldsWhenCompleted — the line dimensions that stay editable on
    // a completed (unposted) invoice. Emitted only as a non-empty array, like the header list.
    describe('editableLineFieldsWhenCompleted', () => {
      for (const [name, options] of [
        ['no options arg', undefined],
        ['an empty array', { editableLineFieldsWhenCompleted: [] }],
        ['a non-array value', { editableLineFieldsWhenCompleted: 'project' }],
      ]) {
        it(`omits the key entirely with ${name}`, () => {
          assert.equal('editableLineFieldsWhenCompleted' in getInvoiceDraftMode(fakeUi, options), false);
        });
      }

      it('sets the given array when non-empty', () => {
        const draftMode = getInvoiceDraftMode(fakeUi, { editableLineFieldsWhenCompleted: ['project', 'costcenter'] });
        assert.deepEqual(draftMode.editableLineFieldsWhenCompleted, ['project', 'costcenter']);
      });

      it('is independent from keepSaveWhenCompletedFields — the invoice call shape sets both', () => {
        const draftMode = getInvoiceDraftMode(fakeUi, {
          keepSaveWhenCompletedFields: ['accountingDate', 'project', 'costcenter'],
          editableLineFieldsWhenCompleted: ['project', 'costcenter'],
        });
        assert.deepEqual(draftMode.keepSaveWhenCompletedFields, ['accountingDate', 'project', 'costcenter']);
        assert.deepEqual(draftMode.editableLineFieldsWhenCompleted, ['project', 'costcenter']);
      });

      it('does not leak into keepSaveWhenCompletedFields when only the line list is given', () => {
        const draftMode = getInvoiceDraftMode(fakeUi, { editableLineFieldsWhenCompleted: ['project'] });
        assert.equal('keepSaveWhenCompletedFields' in draftMode, false);
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

    // ETP-5378 — Reactivate joins Post in the row kebab, so the grid finally matches the
    // form-view kebab that decisions.json -> window.menuActions already describes. The
    // matrix below IS the acceptance criteria of the ticket.
    describe('menuActions (ETP-5378 — Reactivate joins Post)', () => {
      const REACTIVATE = {
        key: 'reactivate',
        labelKey: 'reactivate',
        documentAction: 'RE',
        successKey: 'reactivated',
        preUnpost: true,
      };
      const POST = { key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' };
      // ETP-5378 — an invoice has no confirm popup: its form-view Confirm is DetailView's
      // draftMode button firing this same docAction, so the row entry is that action.
      const CONFIRM = {
        key: 'confirm',
        labelKey: 'confirm',
        documentAction: 'CO',
        successKey: 'documentConfirmed',
      };
      const build = () => buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});

      it('completed and NOT posted -> Reactivate AND Post, in that order', () => {
        const actions = build().menuActions({ row: { documentStatus: 'CO', processed: true, posted: 'N' } });
        assert.deepEqual(actions, [REACTIVATE, POST]);
      });

      // ETP-5692 — reverses ETP-5302: a posted invoice offers a standalone Unpost too.
      it('completed and posted -> Reactivate AND Unpost, in that order (never Post)', () => {
        const actions = build().menuActions({ row: { documentStatus: 'CO', processed: true, posted: 'Y' } });
        assert.deepEqual(actions, [REACTIVATE, UNPOST_ENTRY]);
      });

      it('draft -> Confirm only, never Reactivate or Post', () => {
        const actions = build().menuActions({ row: { documentStatus: 'DR', processed: false, posted: 'N' } });
        assert.deepEqual(actions, [CONFIRM]);
      });

      it('a posting-error status (posted="i") still counts as not posted, so Post stays offered', () => {
        const actions = build().menuActions({ row: { documentStatus: 'CO', processed: true, posted: 'i' } });
        assert.deepEqual(actions, [REACTIVATE, POST]);
      });

      it('carries preUnpost so reactivating a posted invoice reverses its accounting first', () => {
        const [reactivate] = build().menuActions({ row: { documentStatus: 'CO', processed: true, posted: 'Y' } });
        assert.equal(reactivate.preUnpost, true);
        assert.equal(reactivate.documentAction, 'RE');
      });

      it('exposes documentStatus as the statusField so RowQuickActions can resolve the status', () => {
        assert.equal(build().statusField, 'documentStatus');
      });

      it('never offers Confirm outside draft — the three states do not overlap', () => {
        for (const row of [
          { documentStatus: 'CO', processed: true, posted: 'N' },
          { documentStatus: 'CO', processed: true, posted: 'Y' },
          { documentStatus: 'VO', processed: true, posted: 'Y' },
        ]) {
          assert.ok(!build().menuActions({ row }).some(a => a.key === 'confirm'));
        }
      });
    });

    // Standalone Unpost in the row kebab: only a Completed AND posted invoice, never next to
    // Post, never on a draft or voided one. `posted` counts only as 'Y' / true — 'N', the
    // posting-error 'i' and 'E' all mean not posted.
    describe('menuActions — standalone Unpost gate', () => {
      const build = () => buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {});
      const keys = (row) => build().menuActions({ row }).map((a) => a.key);

      it('offers Unpost on a Completed invoice posted as true (boolean)', () => {
        const actions = build().menuActions({ row: { documentStatus: 'CO', processed: true, posted: true } });
        assert.deepEqual(actions.find((a) => a.key === 'unpost'), UNPOST_ENTRY);
      });

      for (const posted of ['N', 'i', 'E', false, null, undefined]) {
        it(`does not offer Unpost on a Completed invoice with posted=${JSON.stringify(posted)}`, () => {
          assert.ok(!keys({ documentStatus: 'CO', processed: true, posted }).includes('unpost'));
        });
      }

      for (const documentStatus of ['DR', 'VO']) {
        it(`does not offer Unpost on a posted ${documentStatus} invoice`, () => {
          assert.ok(!keys({ documentStatus, processed: documentStatus === 'VO', posted: 'Y' }).includes('unpost'));
        });
      }

      it('never offers Unpost together with Post', () => {
        for (const posted of ['Y', true, 'N', 'i', 'E', false]) {
          for (const documentStatus of ['CO', 'DR', 'VO']) {
            const k = keys({ documentStatus, processed: documentStatus !== 'DR', posted });
            assert.ok(!(k.includes('unpost') && k.includes('post')), `${documentStatus}/${posted}: ${k}`);
          }
        }
      });
    });

    describe('onMenuActionExecuted — failure toast forwards messageKeys', () => {
      afterEach(() => mock.restoreAll());

      it('translates a row-kebab Unpost rejected for a closed period through messageKeys', () => {
        const errorSpy = mock.method(toast, 'error', () => {});
        const ui = (k) => (k === 'backendError.periodClosedForUnposting' ? 'PERIODO CERRADO' : k);
        let refreshCalls = 0;
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {}, {
          ui, onRefresh: () => { refreshCalls += 1; },
        });
        result.onMenuActionExecuted(
          UNPOST_ENTRY,
          { success: false, message: 'Already-resolved prose nobody maps', messageKeys: ['PeriodClosedForUnPosting'] },
        );
        assert.equal(errorSpy.mock.callCount(), 1);
        assert.equal(errorSpy.mock.calls[0].arguments[0], 'PERIODO CERRADO');
        assert.equal(refreshCalls, 1);
      });

      it('toasts the Unpost success key on success', () => {
        const successSpy = mock.method(toast, 'success', () => {});
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {}, { ui: fakeUi });
        result.onMenuActionExecuted(UNPOST_ENTRY, { success: true });
        assert.equal(successSpy.mock.calls[0].arguments[0], '__documentUnposted__');
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

      // ETP-5378 — reactivate is a documentAction, not a neoAction; the old
      // `if (!action.neoAction) return` guard dropped its toast and its refresh.
      it('calls onRefresh for a documentAction menu action too (ETP-5378)', () => {
        let refreshCalls = 0;
        const result = buildInvoiceRowQuickActions(() => {}, 'x', () => {}, () => {}, () => {}, {
          onRefresh: () => { refreshCalls += 1; },
        });
        result.onMenuActionExecuted({ documentAction: 'RE', successKey: 'reactivated' }, { success: true });
        assert.equal(refreshCalls, 1);
      });
    });
  });

  // The invoice bulk "Descontabilizar" pair: only Completed AND posted rows run.
  describe('buildInvoiceUnpostActions / invoiceUnpostRowFilter', () => {
    const CO_POSTED = { id: 'a', documentStatus: 'CO', posted: 'Y' };
    const CO_NOT_POSTED = { id: 'b', documentStatus: 'CO', posted: 'N' };
    const VO_POSTED = { id: 'c', documentStatus: 'VO', posted: 'Y' };
    const UNPOST_ACTION = [{ value: 'unpost', labelKey: 'unpost' }];

    describe('buildInvoiceUnpostActions', () => {
      it('offers unpost when at least one row is Completed and posted', () => {
        assert.deepEqual(buildInvoiceUnpostActions([CO_NOT_POSTED, CO_POSTED, VO_POSTED]), UNPOST_ACTION);
      });

      it('offers nothing when no row is Completed and posted', () => {
        assert.deepEqual(buildInvoiceUnpostActions([CO_NOT_POSTED, VO_POSTED]), []);
        assert.deepEqual(buildInvoiceUnpostActions([]), []);
      });

      it('accepts posted=true and the legacy docStatus key', () => {
        assert.deepEqual(buildInvoiceUnpostActions([{ docStatus: 'CO', posted: true }]), UNPOST_ACTION);
      });

      it('treats the posting-error statuses as not posted', () => {
        assert.deepEqual(buildInvoiceUnpostActions([
          { documentStatus: 'CO', posted: 'i' },
          { documentStatus: 'CO', posted: 'E' },
        ]), []);
      });
    });

    describe('invoiceUnpostRowFilter', () => {
      it('lets a Completed and posted row run', () => {
        assert.equal(invoiceUnpostRowFilter(CO_POSTED, 'unpost', fakeUi), true);
      });

      it('rejects a not-posted row with bulkRowNotPosted', () => {
        assert.equal(invoiceUnpostRowFilter(CO_NOT_POSTED, 'unpost', fakeUi), '__bulkRowNotPosted__');
        assert.equal(invoiceUnpostRowFilter({ documentStatus: 'CO', posted: 'i' }, 'unpost', fakeUi), '__bulkRowNotPosted__');
      });

      it('rejects a posted row that is not Completed with bulkRowNotCompleted', () => {
        assert.equal(invoiceUnpostRowFilter(VO_POSTED, 'unpost', fakeUi), '__bulkRowNotCompleted__');
        assert.equal(invoiceUnpostRowFilter({ documentStatus: 'DR', posted: true }, 'unpost', fakeUi), '__bulkRowNotCompleted__');
      });

      it('reads the status from docStatus when documentStatus is absent', () => {
        assert.equal(invoiceUnpostRowFilter({ docStatus: 'CO', posted: 'Y' }, 'unpost', fakeUi), true);
        assert.equal(invoiceUnpostRowFilter({ docStatus: 'VO', posted: 'Y' }, 'unpost', fakeUi), '__bulkRowNotCompleted__');
      });

      it('prefers documentStatus over docStatus', () => {
        assert.equal(invoiceUnpostRowFilter({ documentStatus: 'CO', docStatus: 'VO', posted: 'Y' }, 'unpost', fakeUi), true);
      });

      it('in a mixed selection, only the Completed and posted rows pass', () => {
        const rows = [CO_POSTED, CO_NOT_POSTED, VO_POSTED, { id: 'd', documentStatus: 'CO', posted: true }];
        const runnable = rows.filter((r) => invoiceUnpostRowFilter(r, 'unpost', fakeUi) === true).map((r) => r.id);
        assert.deepEqual(runnable, ['a', 'd']);
      });

      it('lets every row through for an action other than unpost', () => {
        assert.equal(invoiceUnpostRowFilter(CO_NOT_POSTED, 'post', fakeUi), true);
        assert.equal(invoiceUnpostRowFilter(VO_POSTED, 'other', fakeUi), true);
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
