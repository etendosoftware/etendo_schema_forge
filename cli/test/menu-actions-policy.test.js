// Policy tests: assert which actions are (and are not) present in each window's
// kebab menu (decisions.json → window.menuActions).
//
// Background: "Cancel" was removed from the 3-dot menu because it already
// appears as a standalone button in the document header. "Duplicate" was
// removed from Sales Invoice's kebab for the same reason (Clone button exists
// in the topbar). These tests prevent accidental re-introduction.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, '../../artifacts');

function loadMenuActions(windowName) {
  const path = resolve(artifactsDir, windowName, 'decisions.json');
  const decisions = JSON.parse(readFileSync(path, 'utf-8'));
  return decisions.window?.menuActions ?? [];
}

function keys(actions) {
  return actions.map(a => a.key);
}

// Windows that must NOT have a "cancel" kebab action
const NO_CANCEL_WINDOWS = [
  'sales-order',
  'goods-shipment',
  'sales-invoice',
  'purchase-order',
  'purchase-invoice',
];

describe('menuActions policy — cancel must not appear in kebab menu', () => {
  for (const win of NO_CANCEL_WINDOWS) {
    it(`${win}: no "cancel" in menuActions`, () => {
      const actions = loadMenuActions(win);
      assert.ok(
        !keys(actions).includes('cancel'),
        `"cancel" must not be in ${win} menuActions — it is already shown as a header button`,
      );
    });
  }
});

describe('menuActions policy — duplicate must not appear in sales-invoice kebab menu', () => {
  it('sales-invoice: no "duplicate" in menuActions', () => {
    const actions = loadMenuActions('sales-invoice');
    assert.ok(
      !keys(actions).includes('duplicate'),
      '"duplicate" must not be in sales-invoice menuActions — Clone button exists in the topbar',
    );
  });
});

describe('menuActions policy — goods-shipment kebab contains only post/unpost', () => {
  // ETP-4298 added declarative Post/Unpost actions to goods-shipment. The kebab
  // must expose exactly those two keys — and still must NOT carry "cancel"
  // (header button) or "duplicate".
  it('goods-shipment: menuActions contains exactly "post" and "unpost"', () => {
    const actions = loadMenuActions('goods-shipment');
    assert.deepEqual(
      [...keys(actions)].sort(),
      ['post', 'unpost'],
      `goods-shipment menuActions must be exactly [post, unpost], got: [${keys(actions).join(', ')}]`,
    );
  });

  it('goods-shipment: no "cancel" in menuActions', () => {
    const actions = loadMenuActions('goods-shipment');
    assert.ok(
      !keys(actions).includes('cancel'),
      '"cancel" must not be in goods-shipment menuActions — it is already shown as a header button',
    );
  });

  it('goods-shipment: no "duplicate" in menuActions', () => {
    const actions = loadMenuActions('goods-shipment');
    assert.ok(
      !keys(actions).includes('duplicate'),
      '"duplicate" must not be in goods-shipment menuActions',
    );
  });
});

describe('menuActions policy — reactivate is preserved where expected', () => {
  const WITH_REACTIVATE = [
    'sales-order',
    'sales-invoice',
    'purchase-invoice',
  ];

  for (const win of WITH_REACTIVATE) {
    it(`${win}: "reactivate" is present in menuActions`, () => {
      const actions = loadMenuActions(win);
      assert.ok(
        keys(actions).includes('reactivate'),
        `"reactivate" must remain in ${win} menuActions`,
      );
    });
  }
});

describe('menuActions policy — reactivate must not appear in purchase-order', () => {
  it('purchase-order: no "reactivate" in menuActions', () => {
    const actions = loadMenuActions('purchase-order');
    assert.ok(
      !keys(actions).includes('reactivate'),
      '"reactivate" must not be in purchase-order menuActions — Reactivate does not apply in the Purchases module',
    );
  });
});

