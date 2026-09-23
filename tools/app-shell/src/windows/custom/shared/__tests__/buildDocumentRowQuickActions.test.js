import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { toast } from 'sonner';
import {
  buildPostMenuActions,
  buildPostUnpostMenuActions,
  buildMenuActionExecutedHandler,
  buildDocumentRowQuickActionsPostMenu,
} from '../buildDocumentRowQuickActions.js';

const UNPOST_ACTION = { key: 'unpost', labelKey: 'unpost', neoAction: 'unpost', successKey: 'documentUnposted', destructive: true };
const POST_ACTION = { key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' };

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

  describe('buildPostUnpostMenuActions (ETP-5360 — row-hover Post OR Unpost)', () => {
    it('offers only a destructive unpost when the row is posted (Y)', () => {
      assert.deepEqual(buildPostUnpostMenuActions({ row: { processed: 'Y', posted: 'Y' } }), [UNPOST_ACTION]);
    });

    it('offers only a destructive unpost when the row is posted (boolean true)', () => {
      const actions = buildPostUnpostMenuActions({ row: { processed: true, posted: true } });
      assert.deepEqual(actions, [UNPOST_ACTION]);
      assert.equal(actions[0].destructive, true);
      assert.equal(actions[0].successKey, 'documentUnposted');
    });

    it('offers only post when the row is processed and not posted', () => {
      assert.deepEqual(buildPostUnpostMenuActions({ row: { processed: 'Y', posted: 'N' } }), [POST_ACTION]);
      assert.deepEqual(buildPostUnpostMenuActions({ row: { processed: true, posted: false } }), [POST_ACTION]);
    });

    it('returns no actions for a draft (unprocessed, unposted) row', () => {
      assert.deepEqual(buildPostUnpostMenuActions({ row: { processed: 'N', posted: 'N' } }), []);
      assert.deepEqual(buildPostUnpostMenuActions({ row: { processed: false, posted: false } }), []);
    });

    it('returns no actions for an empty row, a missing row, or no arguments', () => {
      assert.deepEqual(buildPostUnpostMenuActions({ row: {} }), []);
      assert.deepEqual(buildPostUnpostMenuActions({}), []);
      assert.deepEqual(buildPostUnpostMenuActions(), []);
    });
  });

  describe('buildMenuActionExecutedHandler — error toast forwards messageKeys (ETP-5360)', () => {
    afterEach(() => mock.restoreAll());

    it('translates a failure through result.messageKeys (PeriodClosedForUnPosting)', () => {
      const errorSpy = mock.method(toast, 'error', () => {});
      const ui = (k) => (k === 'backendError.periodClosedForUnposting' ? 'PERIOD CLOSED' : k);
      const handler = buildMenuActionExecutedHandler(ui, () => {});
      handler(
        { neoAction: 'unpost', successKey: 'documentUnposted' },
        { success: false, message: 'Some already-resolved prose nobody maps', messageKeys: ['PeriodClosedForUnPosting'] },
      );
      assert.equal(errorSpy.mock.callCount(), 1);
      assert.equal(errorSpy.mock.calls[0].arguments[0], 'PERIOD CLOSED');
    });

    it('falls back to the raw message when messageKeys are unknown', () => {
      const errorSpy = mock.method(toast, 'error', () => {});
      const handler = buildMenuActionExecutedHandler((k) => k, () => {});
      handler({ neoAction: 'unpost' }, { success: false, message: 'boom', messageKeys: ['SomethingUnmapped'] });
      assert.equal(errorSpy.mock.calls[0].arguments[0], 'boom');
    });

    it('falls back to actionFailed when there is neither message nor a mapped key', () => {
      const errorSpy = mock.method(toast, 'error', () => {});
      const handler = buildMenuActionExecutedHandler(fakeUi, () => {});
      handler({ neoAction: 'unpost' }, { success: false });
      assert.equal(errorSpy.mock.calls[0].arguments[0], '__actionFailed__');
    });

    it('shows the unpost success key on success', () => {
      const successSpy = mock.method(toast, 'success', () => {});
      const handler = buildMenuActionExecutedHandler(fakeUi, () => {});
      handler(UNPOST_ACTION, { success: true });
      assert.equal(successSpy.mock.calls[0].arguments[0], '__documentUnposted__');
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

    it('defaults to the Post-only builder when includeUnpost is omitted or false (ETP-5360)', () => {
      assert.equal(buildDocumentRowQuickActionsPostMenu().menuActions, buildPostMenuActions);
      assert.equal(
        buildDocumentRowQuickActionsPostMenu({ ui: fakeUi, onRefresh: () => {}, includeUnpost: false }).menuActions,
        buildPostMenuActions,
      );
    });

    it('uses buildPostUnpostMenuActions when includeUnpost is true (ETP-5360)', () => {
      const slice = buildDocumentRowQuickActionsPostMenu({ ui: fakeUi, onRefresh: () => {}, includeUnpost: true });
      assert.equal(slice.menuActions, buildPostUnpostMenuActions);
      assert.deepEqual(slice.menuActions({ row: { processed: 'Y', posted: 'Y' } }), [UNPOST_ACTION]);
      assert.equal(typeof slice.onMenuActionExecuted, 'function');
    });
  });
});
