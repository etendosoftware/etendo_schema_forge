// @covers tools/app-shell/src/windows/standardListViewSurface.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isStandardListViewSurface } from '../standardListViewSurface.js';

describe('standard ListView surface contract', () => {
  it('accepts audited sources with the standard default layout', () => {
    assert.equal(isStandardListViewSurface(true, { window: {} }), true);
    assert.equal(isStandardListViewSurface(true, { window: { layoutType: 'default' } }), true);
  });

  it('rejects unaudited entry points even with a standard-looking contract', () => {
    assert.equal(isStandardListViewSurface(false, { window: {} }), false);
    assert.equal(isStandardListViewSurface(undefined, { window: {} }), false);
  });

  it('rejects missing or unavailable contracts', () => {
    for (const contract of [null, undefined, {}, { window: null }, { window: [] }, { window: 'default' }, { window: true }]) {
      assert.equal(isStandardListViewSurface(true, contract), false);
    }
  });

  it('rejects every custom layout and header table override', () => {
    for (const layoutType of ['custom', 'kanban', 'gallery', 'calendar', 'list-modal', 'unknown']) {
      assert.equal(isStandardListViewSurface(true, { window: { layoutType } }), false);
    }
    assert.equal(isStandardListViewSurface(true, {
      window: { layoutType: 'default', customComponents: { headerTable: 'CustomTable' } },
    }), false);
  });

  it('requires an exact audited header-table contract match', () => {
    const contract = { window: { customComponents: { headerTable: 'InvoiceHeaderTable' } } };
    assert.equal(isStandardListViewSurface(true, contract, 'InvoiceHeaderTable'), true);
    assert.equal(isStandardListViewSurface(true, contract, 'PaymentHeaderTable'), false);
    assert.equal(isStandardListViewSurface(true, contract), false);
    assert.equal(isStandardListViewSurface(true, { window: {} }, 'InvoiceHeaderTable'), false);
    assert.equal(isStandardListViewSurface(false, contract, 'InvoiceHeaderTable'), false);
  });

  it('rejects malformed custom component maps and layout values', () => {
    for (const customComponents of [[], 'InvoiceHeaderTable', true, 1]) {
      assert.equal(isStandardListViewSurface(true, { window: { customComponents } }), false);
    }
    for (const layoutType of ['', false, 0, [], {}]) {
      assert.equal(isStandardListViewSurface(true, { window: { layoutType } }), false);
    }
  });

  it('admits a gallery list contract only through its exact audited layout', () => {
    const contract = { window: { layoutType: 'gallery' } };
    assert.equal(isStandardListViewSurface(true, contract), false);
    assert.equal(isStandardListViewSurface(true, contract, null, 'gallery'), true);
    assert.equal(isStandardListViewSurface(true, { window: {} }, null, 'gallery'), false);
    assert.equal(isStandardListViewSurface(true, {
      window: { layoutType: 'gallery', customComponents: { headerTable: 'OtherTable' } },
    }, null, 'gallery'), false);
  });

  it('allows unrelated custom detail slots without changing the list table contract', () => {
    assert.equal(isStandardListViewSurface(true, {
      window: { customComponents: { sidePanel: 'SidePanel', bottomSection: 'Footer' } },
    }), true);
  });
});
