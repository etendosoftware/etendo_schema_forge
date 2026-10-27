// @covers tools/app-shell/src/lib/specWriteAccess.js
/**
 * Whether the current role may write the window behind a spec — the gate for inline "+ create"
 * affordances that write to another spec than the window they live in.
 *
 *   1. `canWriteWindow` — admin always; otherwise only a loaded "full" tier; everything else fails
 *      closed (read-only, none, missing key, unloaded map, missing window id, unknown value).
 *   2. `canCreateInSpec` — a spec backed by a window follows `canWriteWindow`; a spec with no window
 *      in the menu is not gated; an empty spec is never creatable.
 *   3. `buildWindowIdBySlug` — slug → stringified window id, items without a window id skipped.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWindowIdBySlug, canWriteWindow, canCreateInSpec } from '../specWriteAccess.js';

describe('canWriteWindow', () => {
  it('admin / client-admin → true, even with an empty or unloaded map', () => {
    assert.equal(canWriteWindow({}, '141', true), true);
    assert.equal(canWriteWindow(null, '141', true), true);
    assert.equal(canWriteWindow(undefined, undefined, true), true);
  });

  it('"full" tier on the window → true', () => {
    assert.equal(canWriteWindow({ 141: 'full' }, '141', false), true);
  });

  const denied = [
    ['"read-only" tier', { 141: 'read-only' }, '141'],
    ['"none" tier', { 141: 'none' }, '141'],
    ['window missing from the map', { 999: 'full' }, '141'],
    ['empty map', {}, '141'],
    ['null map (not loaded)', null, '141'],
    ['undefined map (not loaded)', undefined, '141'],
    ['missing window id', { 141: 'full' }, null],
    ['empty window id', { '': 'full' }, ''],
    ['unknown tier value', { 141: 'FULL' }, '141'],
    ['boolean tier value', { 141: true }, '141'],
  ];
  for (const [label, map, windowId] of denied) {
    it(`${label} → false (fail closed)`, () => {
      assert.equal(canWriteWindow(map, windowId, false), false);
    });
  }

  it('reads a single key, so a lookup-only Proxy map (demo mode) works', () => {
    const proxy = new Proxy({}, { get: (_t, key) => (key === '141' ? 'full' : undefined) });
    assert.equal(canWriteWindow(proxy, '141', false), true);
    assert.equal(canWriteWindow(proxy, '142', false), false);
  });
});

describe('canCreateInSpec', () => {
  const windowIdBySlug = { 'payment-term': '141' };

  it('a spec backed by a window follows canWriteWindow', () => {
    assert.equal(canCreateInSpec({ spec: 'payment-term', windowIdBySlug, windowAccess: { 141: 'full' } }), true);
    assert.equal(canCreateInSpec({ spec: 'payment-term', windowIdBySlug, windowAccess: { 141: 'read-only' } }), false);
    assert.equal(canCreateInSpec({ spec: 'payment-term', windowIdBySlug, windowAccess: {} }), false);
    assert.equal(canCreateInSpec({ spec: 'payment-term', windowIdBySlug, windowAccess: null }), false);
    assert.equal(canCreateInSpec({ spec: 'payment-term', windowIdBySlug, windowAccess: {}, isAdmin: true }), true);
  });

  it('a spec with no window in the menu is not gated', () => {
    assert.equal(canCreateInSpec({ spec: 'transaction-type', windowIdBySlug, windowAccess: {} }), true);
    assert.equal(canCreateInSpec({ spec: 'transaction-type', windowIdBySlug: null, windowAccess: null }), true);
  });

  it('an inherited Object.prototype key is not a mapped spec', () => {
    assert.equal(canCreateInSpec({ spec: 'constructor', windowIdBySlug, windowAccess: {} }), true);
  });

  it('an empty / missing spec → false, whatever the access', () => {
    assert.equal(canCreateInSpec({ spec: '', windowIdBySlug, windowAccess: { 141: 'full' }, isAdmin: true }), false);
    assert.equal(canCreateInSpec({ spec: undefined, windowIdBySlug, windowAccess: {}, isAdmin: true }), false);
  });
});

describe('buildWindowIdBySlug', () => {
  it('maps slug → stringified window id and skips items without one', () => {
    const menu = [
      { items: [
        { name: 'dashboard' },
        { name: 'payment-term', windowId: 141 },
        { name: 'sales-order', windowId: '143' },
        { name: 'custom-page', windowId: '' },
      ] },
      { items: [{ windowId: '999' }, null] },
      {},
      null,
    ];
    assert.deepEqual(buildWindowIdBySlug(menu), { 'payment-term': '141', 'sales-order': '143' });
  });

  it('null / undefined / empty menu → {}', () => {
    assert.deepEqual(buildWindowIdBySlug(null), {});
    assert.deepEqual(buildWindowIdBySlug(undefined), {});
    assert.deepEqual(buildWindowIdBySlug([]), {});
  });
});
