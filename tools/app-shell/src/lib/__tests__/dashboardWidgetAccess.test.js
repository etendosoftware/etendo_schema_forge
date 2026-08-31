import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterByNavigationWindow,
  filterQuickActions,
  hasAnyWindowRead,
  hasWindowRead,
  hasWindowWrite,
  isWidgetVisible,
  PENDING_TASK_WINDOWS,
  resolvePendingAmountsVisibility,
  WIDGET_REQUIREMENTS,
} from '../dashboardWidgetAccess.js';

/**
 * ETP-5088 — the requirement is the widget x role matrix attached to the issue. These tests
 * encode the FIVE roles of that matrix as the real `AD_Window_Access` grants each one holds in
 * the tenant, then assert the resulting visibility cell by cell. If someone later changes a
 * declaration in `dashboardWidgetAccess.js`, the matrix row it breaks is named in the failure.
 */

// Real grants, verified against the tenant (`Y` -> 'full', `N` -> 'read-only', absent -> none).
const FINANCE = {
  contacts: 'full', product: 'full', 'sales-order': 'read-only', 'sales-invoice': 'full',
  'physical-inventory': 'full', 'purchase-order': 'read-only', 'purchase-invoice': 'full',
  'financial-account': 'full',
};
const SALES = {
  contacts: 'full', product: 'full', 'sales-order': 'full', 'sales-invoice': 'full',
  'physical-inventory': 'full', 'goods-shipment': 'full',
};
const PURCHASING = {
  contacts: 'full', product: 'full', 'purchase-order': 'full', 'purchase-invoice': 'full',
  'goods-receipt': 'full',
};
const INVENTORY = {
  contacts: 'read-only', product: 'full', 'sales-order': 'read-only',
  'physical-inventory': 'full', 'goods-shipment': 'full', 'purchase-order': 'read-only',
  'goods-receipt': 'full',
};
const NO_ROLE = {};

describe('tier helpers', () => {
  test('hasWindowRead accepts both tiers, hasWindowWrite only full', () => {
    assert.equal(hasWindowRead(FINANCE, 'sales-order'), true);   // read-only
    assert.equal(hasWindowWrite(FINANCE, 'sales-order'), false); // ...but not writable
    assert.equal(hasWindowWrite(SALES, 'sales-order'), true);
  });

  test('both fail closed on an unloaded map, a missing slug and a bogus tier', () => {
    assert.equal(hasWindowRead(NO_ROLE, 'sales-invoice'), false);
    assert.equal(hasWindowRead(null, 'sales-invoice'), false);
    assert.equal(hasWindowRead(SALES, 'purchase-invoice'), false);
    assert.equal(hasWindowRead({ 'sales-invoice': 'maybe' }, 'sales-invoice'), false);
    assert.equal(hasWindowWrite({ 'sales-invoice': true }, 'sales-invoice'), false);
  });

  test('hasAnyWindowRead is the container-level OR', () => {
    assert.equal(hasAnyWindowRead(INVENTORY, PENDING_TASK_WINDOWS), true);
    assert.equal(hasAnyWindowRead(NO_ROLE, PENDING_TASK_WINDOWS), false);
    assert.equal(hasAnyWindowRead(NO_ROLE, PENDING_TASK_WINDOWS, true), true); // admin bypass
  });
});

describe('matrix: whole-widget rows', () => {
  const ROLES = { FINANCE, SALES, PURCHASING, INVENTORY };
  // Expected visibility per the attached matrix (Admin is covered by the bypass test below).
  const EXPECTED = {
    kpis:           { FINANCE: true,  SALES: false, PURCHASING: false, INVENTORY: false },
    trends:         { FINANCE: true,  SALES: false, PURCHASING: false, INVENTORY: false },
    topClients:     { FINANCE: true,  SALES: true,  PURCHASING: false, INVENTORY: false },
    recentInvoices: { FINANCE: true,  SALES: true,  PURCHASING: false, INVENTORY: false },
    bestProducts:   { FINANCE: true,  SALES: true,  PURCHASING: true,  INVENTORY: true },
    bestSellers:    { FINANCE: true,  SALES: true,  PURCHASING: true,  INVENTORY: true },
  };

  for (const [widget, perRole] of Object.entries(EXPECTED)) {
    for (const [roleName, expected] of Object.entries(perRole)) {
      test(`${widget} is ${expected ? 'visible' : 'hidden'} for ${roleName}`, () => {
        assert.equal(isWidgetVisible(ROLES[roleName], widget), expected);
      });
    }
  }

  test('every declared widget is covered by the matrix expectations above', () => {
    assert.deepEqual(Object.keys(WIDGET_REQUIREMENTS).sort(), Object.keys(EXPECTED).sort());
  });

  test('an undeclared widget is not gated', () => {
    assert.equal(isWidgetVisible(NO_ROLE, 'somethingBrandNew'), true);
  });

  test('admin sees every widget even with an empty access map', () => {
    for (const widget of Object.keys(WIDGET_REQUIREMENTS)) {
      assert.equal(isWidgetVisible(NO_ROLE, widget, true), true);
    }
  });

  test('everything is hidden when the permissions map never arrived (fail closed)', () => {
    for (const widget of Object.keys(WIDGET_REQUIREMENTS)) {
      assert.equal(isWidgetVisible(NO_ROLE, widget), false);
    }
  });
});

describe('matrix: Cobros y pagos (per half)', () => {
  test('Finance sees both halves', () => {
    assert.deepEqual(resolvePendingAmountsVisibility(FINANCE),
      { toCollect: true, toPay: true, visible: true });
  });
  test('Sales sees the collect half only', () => {
    assert.deepEqual(resolvePendingAmountsVisibility(SALES),
      { toCollect: true, toPay: false, visible: true });
  });
  test('Purchasing sees the pay half only', () => {
    assert.deepEqual(resolvePendingAmountsVisibility(PURCHASING),
      { toCollect: false, toPay: true, visible: true });
  });
  test('Inventory sees neither, so the card is hidden', () => {
    assert.deepEqual(resolvePendingAmountsVisibility(INVENTORY),
      { toCollect: false, toPay: false, visible: false });
  });
});

describe('matrix: Accesos rápidos (per item, WRITE tier)', () => {
  const ACTIONS = [
    { to: '/sales-order/new', window: 'sales-order' },
    { to: '/sales-invoice/new', window: 'sales-invoice' },
    { to: '/contacts/new', window: 'contacts' },
  ];
  const windowsOf = (role) => filterQuickActions(ACTIONS, role).map((a) => a.window);

  test('Finance: no new sales order — it holds sales-order READ-ONLY', () => {
    assert.deepEqual(windowsOf(FINANCE), ['sales-invoice', 'contacts']);
  });
  test('Sales: sales order, sales invoice and contact', () => {
    assert.deepEqual(windowsOf(SALES), ['sales-order', 'sales-invoice', 'contacts']);
  });
  test('Purchasing: contact only', () => {
    assert.deepEqual(windowsOf(PURCHASING), ['contacts']);
  });
  test('Inventory: none — it holds contacts READ-ONLY', () => {
    assert.deepEqual(windowsOf(INVENTORY), []);
  });
  test('an action declaring no window is never gated', () => {
    assert.deepEqual(filterQuickActions([{ to: '/anything' }], NO_ROLE), [{ to: '/anything' }]);
  });
});

describe('matrix: Tareas pendientes (per item)', () => {
  const nav = (window) => ({ navigation: { type: 'list', window } });
  const TASKS = [
    nav('sales-invoice'),      // overdue invoices + collections due today
    nav('purchase-invoice'),   // payments due today / overdue
    nav('goods-receipt'),      // receptions
    nav('goods-shipment'),     // deliveries
    nav('physical-inventory'), // low stock
  ];
  const windowsOf = (role) => filterByNavigationWindow(TASKS, role).map((t) => t.navigation.window);

  test('Finance: sales invoices and payments', () => {
    assert.deepEqual(windowsOf(FINANCE),
      ['sales-invoice', 'purchase-invoice', 'physical-inventory']);
  });
  test('Sales: sales invoices and deliveries, no payments, no receptions', () => {
    assert.deepEqual(windowsOf(SALES),
      ['sales-invoice', 'goods-shipment', 'physical-inventory']);
  });
  test('Purchasing: payments and receptions only', () => {
    assert.deepEqual(windowsOf(PURCHASING), ['purchase-invoice', 'goods-receipt']);
  });
  test('Inventory: receptions, deliveries and stock only', () => {
    assert.deepEqual(windowsOf(INVENTORY),
      ['goods-receipt', 'goods-shipment', 'physical-inventory']);
  });

  test('an entry with no resolvable window is dropped by default (fail closed)', () => {
    assert.deepEqual(filterByNavigationWindow([{ text: 'orphan' }], FINANCE), []);
    assert.deepEqual(filterByNavigationWindow([{ navigation: { window: '  ' } }], FINANCE), []);
  });

  test('dropUnresolved:false keeps it — the activity-feed compatibility path', () => {
    const orphan = [{ text: 'orphan' }];
    assert.deepEqual(filterByNavigationWindow(orphan, FINANCE, false, { dropUnresolved: false }),
      orphan);
  });

  test('admin keeps every entry, and a non-array input yields []', () => {
    assert.deepEqual(filterByNavigationWindow(TASKS, NO_ROLE, true), TASKS);
    assert.deepEqual(filterByNavigationWindow(null, FINANCE), []);
  });
});
