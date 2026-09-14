import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPostMenuActions,
  buildMenuActionExecutedHandler,
  buildDocumentRowQuickActionsPostMenu,
} from '../buildDocumentRowQuickActions.js';

const fakeUi = (key) => `__${key}__`;

// ETP-5209 rejection-cycle fix — this module was extracted out of goods-receipt/
// index.jsx and goods-shipment/index.jsx, which each hand-rolled an identical
// posted/processed gate + row-kebab Post entry + toast-and-refresh handler
// (Sonar flagged 28.29% duplicated lines on the PR). Mirrors the coverage shape
// of useInvoiceWindow.test.js's `buildInvoiceRowQuickActions` describe block —
// same gate, same onMenuActionExecuted contract, applied here to a narrower,
// spreadable slice instead of a whole rowQuickActions object.

describe('buildDocumentRowQuickActions', () => {
  describe('buildPostMenuActions (ETP-5209 — row-hover Post entry)', () => {
    it('offers post when the row is processed and not posted', () => {
      const actions = buildPostMenuActions({ row: { processed: 'Y', posted: 'N' } });
      assert.deepEqual(actions, [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }]);
    });

    it('returns no actions when the row is already posted', () => {
      const actions = buildPostMenuActions({ row: { processed: 'Y', posted: 'Y' } });
      assert.deepEqual(actions, []);
    });

    it('returns no actions when the row is not processed yet', () => {
      const actions = buildPostMenuActions({ row: { processed: 'N', posted: 'N' } });
      assert.deepEqual(actions, []);
    });

    it('treats boolean true the same as Y for both posted and processed', () => {
      assert.deepEqual(
        buildPostMenuActions({ row: { processed: true, posted: false } }),
        [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }],
      );
      assert.deepEqual(buildPostMenuActions({ row: { processed: true, posted: true } }), []);
    });

    it('handles a missing/undefined row without throwing (returns no actions)', () => {
      assert.deepEqual(buildPostMenuActions({}), []);
      assert.deepEqual(buildPostMenuActions(), []);
    });
  });

  describe('buildMenuActionExecutedHandler / onRefresh (ETP-5209)', () => {
    it('calls onRefresh when a neoAction menu action completes', () => {
      let refreshCalls = 0;
      const handler = buildMenuActionExecutedHandler(fakeUi, () => { refreshCalls += 1; });
      handler({ neoAction: 'post', successKey: 'documentPosted' }, { success: true });
      assert.equal(refreshCalls, 1);
    });

    it('does not call onRefresh for a menu action without a neoAction', () => {
      let refreshCalls = 0;
      const handler = buildMenuActionExecutedHandler(fakeUi, () => { refreshCalls += 1; });
      handler({ key: 'someOtherAction' }, { success: true });
      assert.equal(refreshCalls, 0);
    });

    it('does not throw when onRefresh is not provided (optional chaining)', () => {
      const handler = buildMenuActionExecutedHandler(fakeUi);
      assert.doesNotThrow(() => handler({ neoAction: 'post' }, { success: true }));
    });

    it('does not throw when ui is not provided (optional chaining)', () => {
      const handler = buildMenuActionExecutedHandler(undefined, () => {});
      assert.doesNotThrow(() => handler({ neoAction: 'post' }, { success: false, message: 'boom' }));
    });
  });

  describe('buildDocumentRowQuickActionsPostMenu (composite, spreadable slice)', () => {
    it('returns a menuActions/onMenuActionExecuted pair', () => {
      const slice = buildDocumentRowQuickActionsPostMenu({ ui: fakeUi, onRefresh: () => {} });
      assert.equal(typeof slice.menuActions, 'function');
      assert.equal(typeof slice.onMenuActionExecuted, 'function');
    });

    it('menuActions is the same reference as buildPostMenuActions (stable across calls)', () => {
      const slice = buildDocumentRowQuickActionsPostMenu({ ui: fakeUi, onRefresh: () => {} });
      assert.equal(slice.menuActions, buildPostMenuActions);
    });

    it('onMenuActionExecuted bumps refreshKey-style onRefresh on a completed neoAction', () => {
      let refreshCalls = 0;
      const slice = buildDocumentRowQuickActionsPostMenu({ ui: fakeUi, onRefresh: () => { refreshCalls += 1; } });
      slice.onMenuActionExecuted({ neoAction: 'post' }, { success: true });
      assert.equal(refreshCalls, 1);
    });

    it('is usable with no arguments (defaults to an empty options object)', () => {
      assert.doesNotThrow(() => buildDocumentRowQuickActionsPostMenu());
    });
  });
});
