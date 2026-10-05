// ETP-5504 — pure helpers behind the structured TopBar breadcrumb.
import { createElement } from 'react';
import { describe, it, expect } from 'vitest';

import {
  BREADCRUMB_MAX_VISIBLE,
  BREADCRUMB_SEPARATOR,
  breadcrumbKey,
  breadcrumbToText,
  normalizeBreadcrumb,
  splitBreadcrumb,
} from '../breadcrumb.js';

const levels = (n) => Array.from({ length: n }, (_, i) => ({ label: `L${i + 1}` }));

describe('normalizeBreadcrumb', () => {
  it('splits a legacy string on " / " into label-only levels', () => {
    expect(normalizeBreadcrumb('Compras / Pedido de Compra / PO-1'))
      .toEqual([{ label: 'Compras' }, { label: 'Pedido de Compra' }, { label: 'PO-1' }]);
  });

  it('does not split on a bare "/" inside a label (e.g. a date)', () => {
    expect(normalizeBreadcrumb('Ventas / FAC 01/02/2026'))
      .toEqual([{ label: 'Ventas' }, { label: 'FAC 01/02/2026' }]);
  });

  it('drops empty and whitespace-only levels from a string', () => {
    expect(normalizeBreadcrumb('Compras /  / Pedido')).toEqual([{ label: 'Compras' }, { label: 'Pedido' }]);
  });

  it('returns an empty list for an empty string', () => {
    expect(normalizeBreadcrumb('')).toEqual([]);
  });

  it('trims labels from a string', () => {
    expect(normalizeBreadcrumb('  Compras  / Pedido ')).toEqual([{ label: 'Compras' }, { label: 'Pedido' }]);
  });

  it('accepts an array of plain strings', () => {
    expect(normalizeBreadcrumb(['Ventas', 'Factura'])).toEqual([{ label: 'Ventas' }, { label: 'Factura' }]);
  });

  it('stringifies numeric levels', () => {
    expect(normalizeBreadcrumb(['Pedido', 1000007])).toEqual([{ label: 'Pedido' }, { label: '1000007' }]);
  });

  it('keeps href and onClick of object levels', () => {
    const onClick = () => {};
    expect(normalizeBreadcrumb([{ label: 'Ventas', href: '/sales', onClick }]))
      .toEqual([{ label: 'Ventas', href: '/sales', onClick }]);
  });

  it('normalizes an empty href to undefined', () => {
    expect(normalizeBreadcrumb([{ label: 'Ventas', href: '' }])[0].href).toBeUndefined();
  });

  it('accepts a mixed array of strings and objects', () => {
    expect(normalizeBreadcrumb(['Ventas', { label: 'Factura', href: '/sales-invoice' }, 'FAC-1']))
      .toEqual([
        { label: 'Ventas' },
        { label: 'Factura', href: '/sales-invoice', onClick: undefined },
        { label: 'FAC-1' },
      ]);
  });

  it('drops null, label-less and blank-label entries from an array', () => {
    expect(normalizeBreadcrumb([null, undefined, {}, { label: '  ' }, '', 'Ok', { href: '/x' }]))
      .toEqual([{ label: 'Ok' }]);
  });

  it('keeps a numeric zero label on an object level', () => {
    expect(normalizeBreadcrumb([{ label: 0 }])).toEqual([{ label: '0', href: undefined, onClick: undefined }]);
  });

  it('returns null for a React node so it is rendered as-is', () => {
    expect(normalizeBreadcrumb(createElement('span', null, 'Custom'))).toBeNull();
  });

  it('returns null for undefined and null', () => {
    expect([normalizeBreadcrumb(undefined), normalizeBreadcrumb(null)]).toEqual([null, null]);
  });
});

describe('splitBreadcrumb', () => {
  it('uses 3 as the default visible maximum', () => {
    expect(BREADCRUMB_MAX_VISIBLE).toBe(3);
  });

  it('keeps exactly 3 levels fully visible', () => {
    const items = levels(3);
    expect(splitBreadcrumb(items)).toEqual({ head: items.slice(0, 2), hidden: [], current: items[2] });
  });

  it('keeps a single level as the current page with an empty head', () => {
    const items = levels(1);
    expect(splitBreadcrumb(items)).toEqual({ head: [], hidden: [], current: items[0] });
  });

  it('returns a null current page for no levels', () => {
    expect(splitBreadcrumb([])).toEqual({ head: [], hidden: [], current: null });
  });

  it('collapses 4 levels to first / hidden(2) / current', () => {
    const items = levels(4);
    expect(splitBreadcrumb(items)).toEqual({ head: [items[0]], hidden: [items[1], items[2]], current: items[3] });
  });

  it('never puts the current page in hidden for long breadcrumbs', () => {
    const items = levels(7);
    const { hidden, current } = splitBreadcrumb(items);
    expect(hidden).not.toContain(current);
    expect(hidden).toHaveLength(5);
  });

  it('honours a custom maxVisible', () => {
    const items = levels(3);
    expect(splitBreadcrumb(items, 2).hidden).toEqual([items[1]]);
  });
});

describe('breadcrumbToText', () => {
  it('joins array labels with the " / " separator', () => {
    expect(breadcrumbToText([{ label: 'Ventas', href: '/s' }, 'Factura']))
      .toBe(['Ventas', 'Factura'].join(BREADCRUMB_SEPARATOR));
  });

  it('normalizes a string (drops blank levels, trims)', () => {
    expect(breadcrumbToText(' Compras /  / Pedido ')).toBe('Compras / Pedido');
  });

  it('returns a React node unchanged', () => {
    const node = createElement('span', null, 'Custom');
    expect(breadcrumbToText(node)).toBe(node);
  });

  it('returns undefined unchanged', () => {
    expect(breadcrumbToText(undefined)).toBeUndefined();
  });
});

describe('breadcrumbKey', () => {
  it('returns a string breadcrumb as its own key', () => {
    expect(breadcrumbKey('Compras / Pedido')).toBe('Compras / Pedido');
  });

  it('returns undefined for no breadcrumb', () => {
    expect(breadcrumbKey(undefined)).toBeUndefined();
  });

  it('gives equal keys for equal-content arrays with different references', () => {
    const a = [{ label: 'Ventas' }, { label: 'Factura', href: '/sales-invoice' }];
    const b = [{ label: 'Ventas' }, { label: 'Factura', href: '/sales-invoice' }];
    expect(breadcrumbKey(a)).toBe(breadcrumbKey(b));
  });

  it('changes when a label changes', () => {
    expect(breadcrumbKey([{ label: 'FAC-1' }])).not.toBe(breadcrumbKey([{ label: 'FAC-2' }]));
  });

  it('changes when an href changes', () => {
    expect(breadcrumbKey([{ label: 'A', href: '/a' }])).not.toBe(breadcrumbKey([{ label: 'A', href: '/b' }]));
  });

  it('distinguishes a level split from a label containing the separator characters', () => {
    // ['A', 'B'] vs ['A / B'] must not collide, or the second would never be re-published.
    expect(breadcrumbKey(['A', 'B'])).not.toBe(breadcrumbKey(['A / B']));
  });

  it('distinguishes href from label boundaries', () => {
    expect(breadcrumbKey([{ label: 'A', href: 'B' }])).not.toBe(breadcrumbKey(['A', 'B']));
  });

  it('is a string (a primitive effect dependency) for arrays', () => {
    expect(typeof breadcrumbKey([{ label: 'A' }])).toBe('string');
  });
});
