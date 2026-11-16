// @covers tools/app-shell/src/windows/custom/shared/importActionClient.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionUrl,
  readAction,
  listAll,
  listLines,
  callReadAction,
  ImportLoadError,
  MAX_ACTION_PAGE,
} from '../importActionClient.js';

// A stub apiFetch that answers each call with the next page and records url + parsed body.
function pagedApiFetch(pages) {
  const calls = [];
  const apiFetch = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    const page = pages[calls.length - 1];
    if (!page) throw new Error(`unexpected call #${calls.length}`);
    return { ok: true, json: async () => ({ response: page }) };
  };
  return { apiFetch, calls };
}

const ARGS = { base: '/b', spec: 'sales-invoice', targetId: 't1', action: 'availableOrders' };

describe('importActionClient — actionUrl', () => {
  for (const [name, entity, expected] of [
    ['defaults to the header entity', undefined, '/b/sales-invoice/header/t1/action/availableOrders'],
    ['uses the entity the caller names', 'goodsShipment', '/b/sales-invoice/goodsShipment/t1/action/availableOrders'],
  ]) {
    it(name, () => {
      assert.equal(actionUrl('/b', 'sales-invoice', 't1', 'availableOrders', entity), expected);
    });
  }

  it('readAction is a POST with the JSON body that skips the record re-read', () => {
    assert.deepEqual(readAction({ orderId: 'o1' }),
      { method: 'POST', body: '{"orderId":"o1"}', refreshVersion: false });
  });
});

describe('importActionClient — listAll paging', () => {
  for (const [name, pages, expectedOffsets, expectedIds] of [
    ['one page: hasMore false stops at once',
      [{ data: [{ id: 'a' }], hasMore: false }], [undefined], ['a']],
    ['follows nextOffset while hasMore',
      [{ data: [{ id: 'a' }], hasMore: true, nextOffset: 1000 },
        { data: [{ id: 'b' }], hasMore: true, nextOffset: 2000 },
        { data: [{ id: 'c' }], hasMore: false }],
      [undefined, 1000, 2000], ['a', 'b', 'c']],
    ['stops when hasMore comes without a nextOffset',
      [{ data: [{ id: 'a' }], hasMore: true }], [undefined], ['a']],
    ['stops on a nextOffset that does not advance (no infinite loop)',
      [{ data: [{ id: 'a' }], hasMore: true, nextOffset: 1000 },
        { data: [{ id: 'b' }], hasMore: true, nextOffset: 1000 }],
      [undefined, 1000], ['a', 'b']],
    ['stops on a zero first nextOffset',
      [{ data: [{ id: 'a' }], hasMore: true, nextOffset: 0 }], [undefined], ['a']],
    ['a page without data adds nothing',
      [{ hasMore: false }], [undefined], []],
  ]) {
    it(name, async () => {
      const { apiFetch, calls } = pagedApiFetch(pages);
      const rows = await listAll({ apiFetch, ...ARGS, params: { includeCovered: true } });
      assert.deepEqual(rows.map(r => r.id), expectedIds);
      assert.deepEqual(calls.map(c => c.body.offset), expectedOffsets);
      for (const c of calls) {
        assert.equal(c.body.limit, MAX_ACTION_PAGE);
        assert.equal(c.body.includeCovered, true);
      }
      assert.equal('offset' in calls[0].body, false, 'the first call sends no offset');
    });
  }

  it('passes the entity through to every page URL', async () => {
    const { apiFetch, calls } = pagedApiFetch([
      { data: [], hasMore: true, nextOffset: 1000 }, { data: [], hasMore: false },
    ]);
    await listAll({ apiFetch, ...ARGS, entity: 'goodsReceipt' });
    assert.deepEqual(calls.map(c => c.url), [
      '/b/sales-invoice/goodsReceipt/t1/action/availableOrders',
      '/b/sales-invoice/goodsReceipt/t1/action/availableOrders',
    ]);
  });
});

describe('importActionClient — listLines', () => {
  it('sends the params as the body and returns the rows in lineNo order', async () => {
    const { apiFetch, calls } = pagedApiFetch([{
      data: [{ id: 'l30', lineNo: '30' }, { id: 'l10', lineNo: 10 }, { id: 'lx' }, { id: 'l20', lineNo: 20 }],
    }]);
    const rows = await listLines({ apiFetch, ...ARGS, action: 'availableOrderLines', params: { orderId: 'o1' } });
    assert.deepEqual(rows.map(r => r.id), ['lx', 'l10', 'l20', 'l30']);
    assert.deepEqual(calls[0].body, { orderId: 'o1' });
  });

  it('resolves to [] when the page has no data', async () => {
    const { apiFetch } = pagedApiFetch([{}]);
    assert.deepEqual(await listLines({ apiFetch, ...ARGS, action: 'availableOrderLines' }), []);
  });
});

describe('importActionClient — callReadAction on a refusal', () => {
  const REFUSAL = { error: { code: 'importTargetNotDraft' } };
  for (const [name, json, expectedBody] of [
    ['carries the server body', async () => REFUSAL, REFUSAL],
    ['carries null when the body is unreadable', async () => { throw new SyntaxError('bad json'); }, null],
  ]) {
    it(name, async () => {
      const apiFetch = async () => ({ ok: false, status: 400, json });
      await assert.rejects(callReadAction({ apiFetch, ...ARGS }),
        (err) => err instanceof ImportLoadError && err.message === 'importLoadFailed'
          && assert.deepEqual(err.body, expectedBody) === undefined);
    });
  }
});
