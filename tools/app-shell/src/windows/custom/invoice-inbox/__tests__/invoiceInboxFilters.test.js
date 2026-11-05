// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxFilters.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INBOX_FILTERS, DEFAULT_FILTER, filterByKey, COUNT_QUERIES, withAllCount, workCount,
  isSelectableRow, isProcessingRow, buildListQuery, idsCriteria, STATUS,
} from '../invoiceInboxFilters.js';

const statusValues = (criterion) => (Array.isArray(criterion.value) ? criterion.value : [criterion.value]);
const allStatuses = (filter) => filter.streams.flatMap((s) => s.flatMap(statusValues));

describe('filter tabs', () => {
  it('lists the tabs in display order', () => {
    assert.deepEqual(INBOX_FILTERS.map((f) => f.key), ['all', 'pending', 'error', 'confirmed', 'discarded']);
    assert.equal(DEFAULT_FILTER, 'all');
  });

  it('Todas covers every status except DISCARDED', () => {
    const covered = new Set(allStatuses(filterByKey('all')));
    assert.deepEqual([...covered].sort(), Object.values(STATUS).filter((s) => s !== STATUS.DISCARDED).sort());
  });

  it('Todas is two streams: ERROR first, then every other covered status', () => {
    const { streams } = filterByKey('all');
    assert.equal(streams.length, 2);
    assert.deepEqual(streams[0], [{ fieldName: 'status', operator: 'equals', value: 'ERROR' }]);
    assert.equal(streams[1][0].operator, 'inSet');
    assert.ok(!streams[1][0].value.includes('ERROR'));
    assert.ok(!streams[1][0].value.includes('DISCARDED'));
  });

  it('Pendientes is PROCESSING + PENDING_REVIEW + READY', () => {
    const { streams } = filterByKey('pending');
    assert.equal(streams.length, 1);
    assert.deepEqual([...streams[0][0].value].sort(), ['PENDING_REVIEW', 'PROCESSING', 'READY']);
  });

  it('Con error, Confirmadas and Descartadas are one equals-criterion each', () => {
    assert.deepEqual(filterByKey('error').streams, [[{ fieldName: 'status', operator: 'equals', value: 'ERROR' }]]);
    assert.deepEqual(filterByKey('confirmed').streams, [[{ fieldName: 'status', operator: 'equals', value: 'CONFIRMED' }]]);
    assert.deepEqual(filterByKey('discarded').streams, [[{ fieldName: 'status', operator: 'equals', value: 'DISCARDED' }]]);
  });

  it('an unknown key falls back to Todas', () => {
    assert.equal(filterByKey('nope').key, 'all');
    assert.equal(filterByKey(undefined).key, 'all');
  });
});

describe('counters', () => {
  it('has one count query per tab except all, equal to that tab\'s criteria', () => {
    assert.deepEqual(Object.keys(COUNT_QUERIES).sort(), ['confirmed', 'discarded', 'error', 'pending']);
    for (const key of Object.keys(COUNT_QUERIES)) assert.deepEqual(COUNT_QUERIES[key], filterByKey(key).streams[0]);
  });

  it('withAllCount adds all = pending + error + confirmed (never discarded)', () => {
    assert.deepEqual(withAllCount({ pending: 3, error: 2, confirmed: 5, discarded: 100 }),
      { pending: 3, error: 2, confirmed: 5, discarded: 100, all: 10 });
  });

  it('withAllCount is null while any counter is unknown', () => {
    assert.equal(withAllCount(null), null);
    assert.equal(withAllCount({ pending: 1, error: 2 }), null);
    assert.equal(withAllCount({ pending: 1, error: null, confirmed: 3 }), null);
  });

  it('workCount (title counter) is pending + error', () => {
    assert.equal(workCount({ pending: 4, error: 3, confirmed: 99 }), 7);
    assert.equal(workCount({ pending: 0, error: 0 }), 0);
  });

  it('workCount is null when pending or error is unknown', () => {
    assert.equal(workCount(null), null);
    assert.equal(workCount({ pending: 4 }), null);
    assert.equal(workCount({ error: 4 }), null);
  });
});

describe('row predicates', () => {
  it('only PENDING_REVIEW, READY and ERROR rows are selectable', () => {
    for (const status of ['PENDING_REVIEW', 'READY', 'ERROR']) assert.equal(isSelectableRow({ status }), true, status);
    for (const status of ['PROCESSING', 'CONFIRMED', 'DISCARDED', 'WHATEVER']) assert.equal(isSelectableRow({ status }), false, status);
    assert.equal(isSelectableRow(null), false);
    assert.equal(isSelectableRow(undefined), false);
  });

  it('isProcessingRow is true only for PROCESSING', () => {
    assert.equal(isProcessingRow({ status: 'PROCESSING' }), true);
    assert.equal(isProcessingRow({ status: 'READY' }), false);
    assert.equal(isProcessingRow(null), false);
  });
});

describe('buildListQuery', () => {
  const criteria = [{ fieldName: 'status', operator: 'equals', value: 'ERROR' }];

  it('pages newest first, with the vendor tax id extra property and no _noCount', () => {
    const q = new URLSearchParams(buildListQuery({ criteria, startRow: 0, endRow: 50 }));
    assert.equal(q.get('_startRow'), '0');
    assert.equal(q.get('_endRow'), '50');
    assert.equal(q.get('_sortBy'), '-created');
    assert.equal(q.get('_extraProperties'), 'businessPartner.taxID');
    assert.equal(q.has('_noCount'), false);
    assert.deepEqual(JSON.parse(q.get('criteria')), criteria);
  });

  it('a counter read sets _noCount=false', () => {
    const q = new URLSearchParams(buildListQuery({ criteria, startRow: 0, endRow: 0, exactCount: true }));
    assert.equal(q.get('_noCount'), 'false');
    assert.equal(q.get('_sortBy'), '-created');
  });

  it('omits criteria when none are given', () => {
    const q = new URLSearchParams(buildListQuery({ criteria: [], startRow: 5, endRow: 9 }));
    assert.equal(q.has('criteria'), false);
  });
});

describe('idsCriteria', () => {
  it('builds an inSet criterion on id', () => {
    assert.deepEqual(idsCriteria(['a', 'b']), [{ fieldName: 'id', operator: 'inSet', value: ['a', 'b'] }]);
  });
});
