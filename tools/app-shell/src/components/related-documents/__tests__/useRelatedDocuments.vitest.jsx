// ETP-5527 — useRelatedDocuments drives both the form section and the preview card from
// one definition. Exercised here with synthetic definitions; the real sales definitions
// are covered by salesRelatedDocs.vitest.js and the form/preview parity test.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../helpers.js', () => ({ fetchById: vi.fn() }));

import { renderHook, waitFor, act } from '@testing-library/react';
import { fetchById } from '../helpers.js';
import { useRelatedDocuments, collectRelatedItems } from '../useRelatedDocuments.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function makeDefinition(overrides = {}) {
  return {
    spec: 'spec-x',
    entity: 'header',
    refreshEvent: 'spec-x:document-created',
    depsKey: (record) => String(record?.parent ?? ''),
    sources: [
      { key: 'sel', type: 'sel-type', select: (record) => record?.linked ?? [] },
      { key: 'fet', type: 'fet-type', fetch: vi.fn(async ({ id }) => [{ id: `f-${id}` }]) },
    ],
    ...overrides,
  };
}

const chips = (items) => items.map(({ type, doc }) => `${type}:${doc.id}`);

function renderRelated(initialProps) {
  // Defaults merged on every render, so a rerender never changes token/apiBaseUrl.
  return renderHook(
    (props) => useRelatedDocuments({ token: 'tok', apiBaseUrl: '/sws/neo/spec-x', ...props }),
    { initialProps },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('collectRelatedItems', () => {
  it('keeps source order, resolves function types, dedupes by type+id and skips non-object docs', () => {
    const a = { key: 'a', type: 'invoice' };
    const b = { key: 'b', type: (doc) => (doc.isReturn ? 'return' : 'shipment') };
    const c = { key: 'c', type: 'invoice' };
    const items = collectRelatedItems([
      [a, [{ id: '1' }, null, 'bogus', { id: '2' }]],
      [b, [{ id: '1', isReturn: true }, { id: '3' }]],
      [c, [{ id: '2' }, { id: '4' }]],
      [c, undefined],
    ]);
    expect(chips(items)).toEqual(['invoice:1', 'invoice:2', 'return:1', 'shipment:3', 'invoice:4']);
  });
});

describe('useRelatedDocuments', () => {
  it.each([
    ['id "new"', { id: 'new' }],
    ['empty id', { id: '' }],
    ['null definition', { id: 'a', definition: null }],
  ])('is disabled for %s: no items, not loading, no request', (_label, props) => {
    const definition = makeDefinition();
    const { result } = renderRelated({ definition, record: undefined, ...props });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(fetchById).not.toHaveBeenCalled();
    expect(definition.sources[1].fetch).not.toHaveBeenCalled();
  });

  it('record === null waits (loading, nothing fetched) until the record arrives', async () => {
    const definition = makeDefinition();
    const { result, rerender } = renderRelated({ definition, id: 'a', record: null });
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(definition.sources[1].fetch).not.toHaveBeenCalled();

    rerender({ definition, id: 'a', record: { id: 'a', linked: [{ id: 's1' }] } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chips(result.current.items)).toEqual(['sel-type:s1', 'fet-type:f-a']);
    expect(fetchById).not.toHaveBeenCalled();
  });

  it('record === undefined loads the detail record via fetchById(spec, entity, id) and feeds it to every source', async () => {
    const definition = makeDefinition();
    const detail = { id: 'a', parent: 'p1', linked: [{ id: 's1' }] };
    fetchById.mockResolvedValue(detail);
    const { result } = renderRelated({ definition, id: 'a', record: undefined });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchById).toHaveBeenCalledTimes(1);
    expect(fetchById).toHaveBeenCalledWith('spec-x', 'header', 'a', 'tok', '/sws/neo/spec-x');
    expect(chips(result.current.items)).toEqual(['sel-type:s1', 'fet-type:f-a']);
    expect(definition.sources[1].fetch).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', record: detail }));
  });

  it('a record that belongs to another id is not ready: no stale chips and no fetch with it (A → B)', async () => {
    const definition = makeDefinition();
    const { result, rerender } = renderRelated({ definition, id: 'a', record: { id: 'a', linked: [{ id: 'sa' }] } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    definition.sources[1].fetch.mockClear();

    // id changes first, the record still belongs to A
    rerender({ definition, id: 'b', record: { id: 'a', linked: [{ id: 'sa' }] } });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(definition.sources[1].fetch).not.toHaveBeenCalled();

    rerender({ definition, id: 'b', record: { id: 'b', linked: [{ id: 'sb' }] } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chips(result.current.items)).toEqual(['sel-type:sb', 'fet-type:f-b']);
    expect(definition.sources[1].fetch).toHaveBeenCalledTimes(1);
  });

  it('discards a response that arrives after the id changed', async () => {
    const pending = { a: deferred(), b: deferred() };
    const definition = makeDefinition({
      sources: [{ key: 'fet', type: 'fet-type', fetch: ({ id }) => pending[id].promise }],
    });
    const { result, rerender } = renderRelated({ definition, id: 'a', record: { id: 'a' } });
    rerender({ definition, id: 'b', record: { id: 'b' } });

    await act(async () => { pending.a.resolve([{ id: 'from-a' }]); });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(true);

    await act(async () => { pending.b.resolve([{ id: 'from-b' }]); });
    expect(chips(result.current.items)).toEqual(['fet-type:from-b']);
    expect(result.current.loading).toBe(false);
  });

  it.each([
    ['the definition refreshEvent', () => window.dispatchEvent(new Event('spec-x:document-created'))],
    ['refresh()', ({ result }) => result.current.refresh()],
    ['a refreshSignal change', ({ rerender, props }) => rerender({ ...props, refreshSignal: 2 })],
  ])('refetches on %s', async (_label, trigger) => {
    const definition = makeDefinition();
    const props = { definition, id: 'a', record: { id: 'a' }, refreshSignal: 1 };
    const hook = renderRelated(props);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(definition.sources[1].fetch).toHaveBeenCalledTimes(1);

    act(() => { trigger({ ...hook, props }); });
    await waitFor(() => expect(definition.sources[1].fetch).toHaveBeenCalledTimes(2));
  });

  it('stops listening to the refreshEvent on unmount', async () => {
    const definition = makeDefinition();
    const { result, unmount } = renderRelated({ definition, id: 'a', record: { id: 'a' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    window.dispatchEvent(new Event('spec-x:document-created'));
    await act(async () => {});
    expect(definition.sources[1].fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches when the depsKey changes, not when the record changes with the same depsKey', async () => {
    const definition = makeDefinition();
    const { result, rerender } = renderRelated({ definition, id: 'a', record: { id: 'a', parent: 'p1' } });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ definition, id: 'a', record: { id: 'a', parent: 'p1', updated: 'later' } });
    await act(async () => {});
    expect(definition.sources[1].fetch).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);

    rerender({ definition, id: 'a', record: { id: 'a', parent: 'p2' } });
    await waitFor(() => expect(definition.sources[1].fetch).toHaveBeenCalledTimes(2));
    expect(definition.sources[1].fetch).toHaveBeenLastCalledWith(expect.objectContaining({ record: { id: 'a', parent: 'p2' } }));
  });

  it('a failing source yields no chips for itself only', async () => {
    const definition = makeDefinition({
      sources: [
        { key: 'badSelect', type: 't', select: () => { throw new Error('boom'); } },
        { key: 'throws', type: 't', fetch: () => { throw new Error('sync boom'); } },
        { key: 'rejects', type: 't', fetch: () => Promise.reject(new Error('async boom')) },
        { key: 'ok', type: 'ok-type', fetch: async () => [{ id: 'fine' }] },
      ],
    });
    const { result } = renderRelated({ definition, id: 'a', record: { id: 'a' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chips(result.current.items)).toEqual(['ok-type:fine']);
  });
});
