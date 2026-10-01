// ETP-5504 — getBreadcrumbItems: the structured breadcrumb DetailView publishes to the TopBar.
// Imports ONLY detailViewHelpers.jsx (see detailViewHelpers.vitest.js for why).
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, field) => (field ? data?.[field] : undefined),
}));

import { getBreadcrumbItems, getFullBreadcrumb } from '../detailViewHelpers.jsx';
import { breadcrumbToText } from '@/components/layout/TopBar/breadcrumb.js';

const T = { Purchases: 'Compras', 'Purchase Order': 'Pedido de Compra' };
const tMenu = (key) => T[key] ?? key;

describe('getBreadcrumbItems', () => {
  it('gives the window level an href to its list', () => {
    const items = getBreadcrumbItems('Purchases / Purchase Order', tMenu, 'PO-1', 'Pedido de Compra', 'purchase-order');
    expect(items[1]).toEqual({ label: 'Pedido de Compra', href: '/purchase-order' });
  });

  it('leaves menu folders without an href', () => {
    const items = getBreadcrumbItems('Purchases / Purchase Order', tMenu, 'PO-1', 'Pedido de Compra', 'purchase-order');
    expect(items[0]).toEqual({ label: 'Compras' });
  });

  it('appends the record title as the last, non-navigable level', () => {
    const items = getBreadcrumbItems('Purchases / Purchase Order', tMenu, 'PO-1', 'Pedido de Compra', 'purchase-order');
    expect(items.at(-1)).toEqual({ label: 'PO-1' });
  });

  it('translates every level through tMenu', () => {
    const items = getBreadcrumbItems('Purchases / Purchase Order', tMenu, 'PO-1', 'x', 'purchase-order');
    expect(items.map((i) => i.label)).toEqual(['Compras', 'Pedido de Compra', 'PO-1']);
  });

  it('trims segments before translating', () => {
    const seen = [];
    getBreadcrumbItems('  Purchases  /  Purchase Order ', (k) => { seen.push(k); return k; }, '', 'x', 'po');
    expect(seen).toEqual(['Purchases', 'Purchase Order']);
  });

  it('does not append a level when there is no record title', () => {
    const items = getBreadcrumbItems('Purchases / Purchase Order', tMenu, '', 'Pedido de Compra', 'purchase-order');
    expect(items).toEqual([{ label: 'Compras' }, { label: 'Pedido de Compra', href: '/purchase-order' }]);
  });

  it('gives no level an href when windowName is missing', () => {
    const items = getBreadcrumbItems('Purchases / Purchase Order', tMenu, 'PO-1', 'x', undefined);
    expect(items.some((i) => i.href)).toBe(false);
  });

  it('makes a single-segment breadcrumb the navigable window level', () => {
    expect(getBreadcrumbItems('Purchase Order', tMenu, 'PO-1', 'x', 'purchase-order'))
      .toEqual([{ label: 'Pedido de Compra', href: '/purchase-order' }, { label: 'PO-1' }]);
  });

  it('falls back to the window title string when there is no breadcrumb', () => {
    expect(getBreadcrumbItems(undefined, tMenu, 'PO-1', 'Pedido de Compra', 'purchase-order')).toBe('Pedido de Compra');
  });

  it('falls back to the window title string for an empty breadcrumb', () => {
    expect(getBreadcrumbItems('', tMenu, 'PO-1', 'Pedido de Compra', 'purchase-order')).toBe('Pedido de Compra');
  });

  it('reads as the same text the legacy getFullBreadcrumb produced', () => {
    const args = ['Purchases / Purchase Order', tMenu, 'PO-1', 'Pedido de Compra'];
    expect(breadcrumbToText(getBreadcrumbItems(...args, 'purchase-order'))).toBe(getFullBreadcrumb(...args));
  });
});
