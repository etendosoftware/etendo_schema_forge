// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxUploadResult.js
// New file justification: invoiceInboxUploadResult.js is a new pure module; no existing test covers it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resultBucket, summarizeUploadResult, resultState, rowsByRequestedId } from '../invoiceInboxUploadResult.js';

const row = (id, status, extra = {}) => ({ id, status, ...extra });

describe('resultBucket', () => {
  it('maps each status to its bucket', () => {
    assert.equal(resultBucket(row('a', 'PENDING_REVIEW')), 'read');
    assert.equal(resultBucket(row('a', 'READY')), 'read');
    assert.equal(resultBucket(row('a', 'ERROR')), 'failed');
    assert.equal(resultBucket(row('a', 'PROCESSING')), 'pending');
    assert.equal(resultBucket(row('a', 'CONFIRMED')), 'handled');
    assert.equal(resultBucket(row('a', 'DISCARDED')), 'handled');
  });

  it('undefined is not read yet (pending) and null is gone', () => {
    assert.equal(resultBucket(undefined), 'pending');
    assert.equal(resultBucket(null), 'gone');
  });

  it('an unknown status counts as pending', () => {
    assert.equal(resultBucket(row('a', 'WHATEVER')), 'pending');
  });
});

describe('rowsByRequestedId', () => {
  it('maps every requested id, null for the ones not returned', () => {
    const map = rowsByRequestedId(['a', 'b'], [row('a', 'READY'), row('zzz', 'READY')]);
    assert.deepEqual([...map.keys()], ['a', 'b']);
    assert.equal(map.get('a').status, 'READY');
    assert.equal(map.get('b'), null);
  });
});

describe('summarizeUploadResult', () => {
  const rows = new Map([
    ['r1', row('r1', 'READY')],
    ['r2', row('r2', 'PENDING_REVIEW')],
    ['e1', row('e1', 'ERROR', { errorCode: 'UNREADABLE' })],
    ['e2', row('e2', 'ERROR', { errorCode: 'UNREADABLE' })],
    ['e3', row('e3', 'ERROR', { errorCode: 'FOREIGN_RECEIVER' })],
    ['e4', row('e4', 'ERROR')],
    ['p1', row('p1', 'PROCESSING')],
    ['h1', row('h1', 'CONFIRMED')],
    ['h2', row('h2', 'DISCARDED')],
    ['g1', null],
  ]);
  const ids = ['r1', 'r2', 'e1', 'e2', 'e3', 'e4', 'p1', 'h1', 'h2', 'g1', 'unread'];
  const summary = summarizeUploadResult(ids, rows);

  it('counts every bucket; an id the map does not know yet is pending', () => {
    assert.deepEqual(
      { total: summary.total, read: summary.read, failed: summary.failed, pending: summary.pending, handled: summary.handled, gone: summary.gone },
      { total: 11, read: 2, failed: 4, pending: 2, handled: 2, gone: 1 },
    );
  });

  it('lists the failed and pending ids', () => {
    assert.deepEqual(summary.failedIds, ['e1', 'e2', 'e3', 'e4']);
    assert.deepEqual(summary.pendingIds, ['p1', 'unread']);
  });

  it('groups the reasons by errorCode (UNKNOWN when none), by count desc then code', () => {
    assert.deepEqual(summary.reasons, [
      { code: 'UNREADABLE', count: 2 },
      { code: 'FOREIGN_RECEIVER', count: 1 },
      { code: 'UNKNOWN', count: 1 },
    ]);
  });

  it('an empty record is all zeros', () => {
    const empty = summarizeUploadResult([], new Map());
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.reasons, []);
  });
});

describe('resultState', () => {
  const base = { read: 0, failed: 0, pending: 0 };
  it('reading: nothing finished yet', () => assert.equal(resultState({ ...base, pending: 3 }), 'reading'));
  it('mixed: some finished, some still read (read or failed)', () => {
    assert.equal(resultState({ ...base, read: 1, pending: 1 }), 'mixed');
    assert.equal(resultState({ ...base, failed: 1, pending: 1 }), 'mixed');
  });
  it('done: everything finished without error', () => assert.equal(resultState({ ...base, read: 2 }), 'done'));
  it('doneWithErrors: everything finished, some failed', () => assert.equal(resultState({ ...base, read: 1, failed: 1 }), 'doneWithErrors'));
});
