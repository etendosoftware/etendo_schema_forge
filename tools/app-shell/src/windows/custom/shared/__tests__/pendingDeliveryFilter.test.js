/**
 * `buildPendingDeliveryFilter` turns the order-list URL params into ListView props.
 *
 * ETP-5009 added `initialFiltersFromUrl`: the flag that tells ListView the `initial*`
 * props of this render are a deep-link intent and therefore outrank the session
 * snapshot. It must be true EXACTLY when at least one of the params actually produced
 * a filter — a window opened with no params must keep restoring the saved grid state.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingDeliveryFilter } from '../pendingDeliveryFilter.js';

const FIELD = 'deliveryStatusPurchase';

/** Minimal stand-in for the URLSearchParams handed over by useSearchParams(). */
function params(query) {
  return new URLSearchParams(query);
}

describe('buildPendingDeliveryFilter — initialFiltersFromUrl (ETP-5009)', () => {
  it('is true for ?filter=pendingDelivery', () => {
    const result = buildPendingDeliveryFilter(params('filter=pendingDelivery'), FIELD);
    assert.equal(result.initialFiltersFromUrl, true);
  });

  it('is true for a DocStatus param alone', () => {
    const result = buildPendingDeliveryFilter(params('DocStatus=CO'), FIELD);
    assert.equal(result.initialFiltersFromUrl, true);
  });

  it('is true when both params are present', () => {
    const result = buildPendingDeliveryFilter(params('filter=pendingDelivery&DocStatus=CO'), FIELD);
    assert.equal(result.initialFiltersFromUrl, true);
  });

  it('is false with no params at all — the saved grid state must still be restored', () => {
    const result = buildPendingDeliveryFilter(params(''), FIELD);
    assert.equal(result.initialFiltersFromUrl, false);
  });

  it('is false for an unrelated filter value', () => {
    const result = buildPendingDeliveryFilter(params('filter=somethingElse'), FIELD);
    assert.equal(result.initialFiltersFromUrl, false);
  });

  it('is false for an unrelated param the builder does not read', () => {
    const result = buildPendingDeliveryFilter(params('tab=lines&page=2'), FIELD);
    assert.equal(result.initialFiltersFromUrl, false);
  });

  it('is false for an empty DocStatus — an empty string produces no filter', () => {
    const result = buildPendingDeliveryFilter(params('DocStatus='), FIELD);
    assert.equal(result.initialFiltersFromUrl, false);
    assert.equal(result.initialColumnFilters, undefined);
  });

  it('is a boolean, never a truthy string — ListView treats the prop as a flag', () => {
    assert.equal(typeof buildPendingDeliveryFilter(params('DocStatus=CO'), FIELD).initialFiltersFromUrl, 'boolean');
    assert.equal(typeof buildPendingDeliveryFilter(params(''), FIELD).initialFiltersFromUrl, 'boolean');
  });
});

describe('buildPendingDeliveryFilter — the filters the flag guards', () => {
  it('builds the pending-delivery advanced filter against the given delivery field', () => {
    const result = buildPendingDeliveryFilter(params('filter=pendingDelivery'), FIELD);

    assert.equal(result.isPendingDelivery, true);
    assert.deepEqual(result.initialAdvancedFilter, {
      rowOperator: 'and',
      conditions: [
        { field: 'documentStatus', operator: 'equals', value: 'CO' },
        { field: FIELD, operator: 'lessThan', value: 100 },
      ],
    });
  });

  it('honours a different delivery field for sales orders', () => {
    const result = buildPendingDeliveryFilter(params('filter=pendingDelivery'), 'deliveryStatus');

    assert.equal(result.initialAdvancedFilter.conditions[1].field, 'deliveryStatus');
  });

  it('maps DocStatus to the documentStatus column filter', () => {
    const result = buildPendingDeliveryFilter(params('DocStatus=DR'), FIELD);

    assert.deepEqual(result.initialColumnFilters, { documentStatus: 'DR' });
    assert.equal(result.isPendingDelivery, false);
    assert.equal(result.initialAdvancedFilter, null);
  });

  it('returns no filters at all when the URL carries none', () => {
    const result = buildPendingDeliveryFilter(params(''), FIELD);

    assert.equal(result.initialColumnFilters, undefined);
    assert.equal(result.initialAdvancedFilter, null);
    assert.equal(result.isPendingDelivery, false);
  });
});
