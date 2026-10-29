// @covers tools/app-shell/src/windows/registry.js
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import menuConfig from '../../menu.json' with { type: 'json' };
import { buildMenuGroups, buildWindowMap, getAllWindowNames } from '../registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registrySrc = readFileSync(join(__dirname, '..', 'registry.js'), 'utf8');

describe('buildMenuGroups', () => {
  it('returns groups from menu.json', () => {
    const groups = buildMenuGroups();
    assert.ok(Array.isArray(groups));
    assert.ok(groups.length >= 4);
    // ETP-5190 moved First Steps above Home: post-signup onboarding is the first thing a new
    // tenant should see in the menu. Pinned by name so a reorder is a deliberate edit here.
    assert.equal(groups[0].group, 'First Steps');
    assert.equal(groups[1].group, 'Home');
    assert.ok(Array.isArray(groups[0].items));
    assert.ok(groups[0].icon);
  });

  it('each item has name and label', () => {
    const groups = buildMenuGroups();
    for (const group of groups) {
      for (const item of group.items) {
        assert.ok(item.name, `missing name in group ${group.group}`);
        assert.ok(item.label, `missing label in group ${group.group}`);
      }
    }
  });
});

describe('getAllWindowNames', () => {
  it('returns flat array of all window slugs', () => {
    const names = getAllWindowNames();
    assert.ok(names.includes('sales-order'));
    assert.ok(names.includes('business-partner'));
    assert.ok(names.includes('product'));
    assert.ok(names.length >= 11);
  });
});

// ETP-5806 — `bp-location` is a wiring/registration contract, not a `buildWindowMap()`
// behavior: AD Window 121 "Location" has no nav entry in menu.json (the inactive-in-menu
// comment above its `windowLoaders` line says so), so `buildWindowMap()` — which only
// iterates `menuConfig.menu` — never surfaces it, and there is no way to exercise this
// registration by calling the module's exported functions. Reading `windowLoaders` as
// source text is the only way to guard that the loader still exists; this is exactly the
// "wiring contract" case test-reuse-policy.md carves out for source-reading (point 7).
describe('windowLoaders registration — bp-location (ETP-5806, source contract)', () => {
  it('registers a bp-location loader pointing at the generated bp-location window', () => {
    assert.match(
      registrySrc,
      /'bp-location':\s*\(\)\s*=>\s*import\(['"]@generated\/bp-location\/generated\/web\/bp-location\/index\.jsx['"]\)/,
    );
  });

  it('is not reachable through buildWindowMap() (no nav entry in menu.json), confirming the loader is a direct-navigation safety net, not a menu window', () => {
    const map = buildWindowMap();
    assert.equal(map['bp-location'], undefined);
    assert.ok(
      !menuConfig.menu.some(group => group.items.some(item => item.name === 'bp-location')),
      'bp-location must have no menu.json nav entry — if one is ever added, extend this test to assert buildWindowMap() resolves it via windowLoaders',
    );
  });
});

describe('buildWindowMap', () => {
  const entries = menuConfig.menu.flatMap(group => group.items.map(item => ({ item, group })));
  const isHidden = ({ item, group }) => Boolean(item.hidden || group.hidden);

  it('creates a loader entry for every visible window in menu.json', () => {
    const map = buildWindowMap();
    for (const entry of entries.filter(e => !isHidden(e))) {
      const { name } = entry.item;
      assert.ok(map[name], `missing window map entry for ${name}`);
      assert.ok(map[name].loader, `missing loader for ${name}`);
      assert.ok(map[name].label, `missing label for ${name}`);
    }
  });

  // ETP-5795 — a hidden window is not reachable by URL unless it declares redirect or routeOnly.
  it('does not register a hidden window that has neither redirect nor routeOnly', () => {
    const map = buildWindowMap();
    const blocked = entries.filter(e => isHidden(e) && !e.item.redirect && !e.item.routeOnly);
    assert.ok(blocked.length > 0);
    for (const { item } of blocked) assert.equal(map[item.name], undefined, `${item.name} must be blocked`);
    assert.equal(map['lead']?.name, 'lead');
    assert.equal(map['hr'], undefined);
  });

  it('keeps a hidden redirect window registered', () => {
    const map = buildWindowMap();
    for (const name of ['business-partner', 'fiscal-calendar', 'open-close-period-control', 'simple-g-l-journal']) {
      assert.ok(map[name], `${name} must stay registered to redirect`);
    }
  });

  it('keeps a routeOnly hidden window registered with its real loader', () => {
    const map = buildWindowMap();
    const routeOnly = entries.filter(e => e.item.routeOnly);
    assert.ok(routeOnly.length > 0);
    for (const { item } of routeOnly) {
      assert.ok(item.hidden || entries.find(e => e.item === item).group.hidden, `${item.name} routeOnly is only meaningful on a hidden item`);
      assert.ok(map[item.name], `${item.name} routeOnly must stay registered`);
    }
  });

  it('registers items of a hidden group only when they are routeOnly', () => {
    const map = buildWindowMap();
    for (const name of ['project', 'time-tracking', 'document']) assert.ok(map[name], `${name} is linked from /projects`);
  });

  it('marks generated windows and audited standard DataTable wrappers as grid-view candidates', () => {
    const map = buildWindowMap();

    assert.equal(map['goods-shipment'].standardListViewSource, true);
    assert.equal(map.amortization.standardListViewSource, true);
    assert.equal(map['financial-account'].standardListViewSource, true);
    for (const name of [
      'amortization', 'assets', 'goods-movements', 'goods-receipt', 'internal-consumption',
      'physical-inventory', 'price-list', 'purchase-order', 'return-to-vendor-shipment',
      'sales-order', 'sales-quotation', 'sales-invoice', 'purchase-invoice',
      'payment-in', 'payment-out', 'user', 'warehouse', 'contacts', 'product',
      'product-category', 'goods-shipment', 'return-material-receipt', 'financial-account',
    ]) assert.equal(map[name].standardListViewSource, true, name);
    for (const name of ['calendar', 'organization', 'fiscal-monitor']) {
      assert.equal(map[name].standardListViewSource, false, name);
    }
  });
});


describe('audited standard table contract slots', () => {
  it('declares the exact forwarding header wrapper for each audited custom table', () => {
    const map = buildWindowMap();
    for (const [name, headerTable] of Object.entries({
      contacts: 'ContactsTable',
      'financial-account': 'AccountsHeaderTable',
      'sales-invoice': 'InvoiceHeaderTable',
      'purchase-invoice': 'InvoiceHeaderTable',
      'payment-in': 'PaymentHeaderTable',
      'payment-out': 'PaymentHeaderTable',
      user: 'UserHeaderTable',
    })) assert.equal(map[name].standardListViewHeaderTable, headerTable, name);
    assert.equal(map['sales-order'].standardListViewHeaderTable, null);
    assert.equal(map.warehouse.standardListViewHeaderTable, null);
    assert.equal(map.product.standardListViewLayout, 'gallery');
    assert.equal(map.contacts.standardListViewLayout, 'default');
  });
});
