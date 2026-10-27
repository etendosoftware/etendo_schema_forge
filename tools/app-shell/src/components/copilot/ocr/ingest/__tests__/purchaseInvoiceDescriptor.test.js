import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLineOps,
  toIsoDate,
  nonBlank,
} from '../purchaseInvoiceDescriptor.js';

/* -------------------------------------------------------------------------- */
/* buildLineOps                                                               */
/* -------------------------------------------------------------------------- */

describe('buildLineOps', () => {
  it('drops lines without a resolved product and surfaces the description', () => {
    const lines = [
      { description: 'Cement bag 50kg', quantity: 10, unit_price: 12 },
      { description: 'Mystery item' },
    ];
    const productByIdx = { 0: 'PROD-1' };
    const { lineOps, unmatched } = buildLineOps(lines, productByIdx);
    assert.equal(lineOps.length, 1);
    assert.deepEqual(unmatched, ['Mystery item']);
  });

  it('maps description, quantity, unit_price into the line body (C-15)', () => {
    const lines = [{
      description: 'Cement bag 50kg',
      quantity: 10,
      unit_price: 12.5,
    }];
    const { lineOps } = buildLineOps(lines, { 0: 'PROD-1' });
    assert.equal(lineOps.length, 1);
    assert.equal(lineOps[0].body.product, 'PROD-1');
    assert.equal(lineOps[0].body.description, 'Cement bag 50kg');
    assert.equal(lineOps[0].body.invoicedQuantity, 10);
    assert.equal(lineOps[0].body.unitPrice, 12.5);
    assert.equal(lineOps[0].body.listPrice, 12.5);
  });

  it('sets body.tax when the resolved tax map has the line idx', () => {
    const lines = [{ description: 'Item', quantity: 1, unit_price: 100 }];
    const { lineOps } = buildLineOps(lines, { 0: 'PROD-1' }, { 0: 'TAX-21' });
    assert.equal(lineOps[0].body.tax, 'TAX-21');
  });

  it('omits body.tax when no tax was resolved (lets server callout fill default)', () => {
    const lines = [{ description: 'Item', quantity: 1, unit_price: 100 }];
    const { lineOps } = buildLineOps(lines, { 0: 'PROD-1' }, {});
    assert.equal('tax' in lineOps[0].body, false);
  });

  it('omits body.description when LLM returned blank/null', () => {
    const lines = [{ description: '   ', quantity: 1, unit_price: 1 }];
    const { lineOps } = buildLineOps(lines, { 0: 'PROD-1' });
    assert.equal('description' in lineOps[0].body, false);
  });

  it('emits one batch op per line with parentRef pointing at "inv"', () => {
    const lines = [
      { description: 'A', quantity: 1, unit_price: 10 },
      { description: 'B', quantity: 2, unit_price: 20 },
    ];
    const { lineOps } = buildLineOps(lines, { 0: 'P1', 1: 'P2' }, { 0: 'T1' });
    assert.equal(lineOps[0].id, 'ln0');
    assert.equal(lineOps[1].id, 'ln1');
    assert.equal(lineOps[0].parentRef, 'inv');
    assert.equal(lineOps[0].spec, 'purchase-invoice');
    assert.equal(lineOps[0].entity, 'Lines');
  });
});

/* -------------------------------------------------------------------------- */
/* sanity checks on existing helpers (regression guard)                        */
/* -------------------------------------------------------------------------- */

describe('descriptor helpers (regression)', () => {
  it('toIsoDate normalises DD/MM/YYYY → YYYY-MM-DD', () => {
    assert.equal(toIsoDate('08/05/2026'), '2026-05-08');
    assert.equal(toIsoDate('8-5-26'), '2026-05-08');
    assert.equal(toIsoDate('2026-05-08'), '2026-05-08');
    assert.equal(toIsoDate(null), null);
  });

  it('nonBlank handles null, undefined, and whitespace', () => {
    assert.equal(nonBlank(null), false);
    assert.equal(nonBlank(undefined), false);
    assert.equal(nonBlank(''), false);
    assert.equal(nonBlank('  '), false);
    assert.equal(nonBlank('x'), true);
    assert.equal(nonBlank(0), true);
  });
});
