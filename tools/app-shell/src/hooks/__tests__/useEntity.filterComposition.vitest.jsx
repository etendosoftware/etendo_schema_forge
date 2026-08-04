import { renderHook, act, waitFor } from '@testing-library/react';
import { useEntity } from '../useEntity';

/**
 * Covers the list-query composition internals of useEntity that are only
 * reachable by actually running the hook: `applyFilterParams` /
 * `extractCriteriaFromFilter` (how baseFilter, columnFilters and trailingFilter
 * collapse into a SINGLE `criteria=` param) and `deriveRecordId` /
 * `normalizeRows` (how list rows without a plain `id` get one).
 *
 * Emitting more than one `criteria=` param silently drops all but one on the
 * backend, so the single-param invariant is the contract under test here.
 */

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const defaultOpts = {
  token: 'test-token',
  apiBaseUrl: 'http://localhost/api',
};

/** Query string of the Nth fetch call, parsed. */
function paramsOfCall(index = 0) {
  const url = globalThis.fetch.mock.calls[index][0];
  return new URLSearchParams(url.split('?')[1] ?? '');
}

/** All `criteria` params of the Nth fetch call (to assert there is exactly one). */
function criteriaOfCall(index = 0) {
  return paramsOfCall(index).getAll('criteria');
}

function renderList(opts = {}, rows = []) {
  globalThis.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: rows } }),
  });
  return renderHook(() => useEntity('header', null, { ...defaultOpts, ...opts }));
}

describe('useEntity — list query composition', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('baseFilter parsing', () => {
    it('emits no criteria param when there is no filter at all', async () => {
      const { result } = renderList();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(criteriaOfCall()).toEqual([]);
    });

    it('forwards non-criteria pairs of baseFilter as passthrough query params', async () => {
      const { result } = renderList({ baseFilter: 'active=true&salesTransaction=Y' });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const params = paramsOfCall();
      expect(params.get('active')).toBe('true');
      expect(params.get('salesTransaction')).toBe('Y');
      expect(params.getAll('criteria')).toEqual([]);
    });

    it('URL-decodes passthrough values', async () => {
      const { result } = renderList({ baseFilter: `label=${encodeURIComponent('a & b')}` });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(paramsOfCall().get('label')).toBe('a & b');
    });

    it('parses a criteria entry carrying a single object', async () => {
      const criteria = JSON.stringify({ fieldName: 'docStatus', operator: 'equals', value: 'DR' });
      const { result } = renderList({ baseFilter: `criteria=${encodeURIComponent(criteria)}` });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const emitted = criteriaOfCall();
      expect(emitted).toHaveLength(1);
      expect(JSON.parse(emitted[0])).toEqual([
        { fieldName: 'docStatus', operator: 'equals', value: 'DR' },
      ]);
    });

    it('parses a criteria entry carrying an array and keeps every element', async () => {
      const criteria = JSON.stringify([
        { fieldName: 'a', operator: 'equals', value: 1 },
        { fieldName: 'b', operator: 'equals', value: 2 },
      ]);
      const { result } = renderList({ baseFilter: `criteria=${encodeURIComponent(criteria)}` });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(JSON.parse(criteriaOfCall()[0])).toHaveLength(2);
    });

    it('skips malformed criteria JSON instead of throwing', async () => {
      const { result } = renderList({ baseFilter: 'criteria=%7Bnot-json&active=true' });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(criteriaOfCall()).toEqual([]);
      expect(paramsOfCall().get('active')).toBe('true');
    });

    it('ignores empty and value-less fragments of the filter string', async () => {
      const { result } = renderList({ baseFilter: '&&justAKey&active=true' });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const params = paramsOfCall();
      expect(params.get('active')).toBe('true');
      expect(params.has('justAKey')).toBe(false);
    });
  });

  describe('column filters', () => {
    it('translates a column filter into criteria via the column definition', async () => {
      const { result } = renderList({
        columnFilters: { docStatus: { type: 'set', values: ['CO'] } },
        columnDefs: { docStatus: { key: 'docStatus' } },
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const emitted = criteriaOfCall();
      expect(emitted).toHaveLength(1);
      expect(JSON.stringify(JSON.parse(emitted[0]))).toContain('docStatus');
    });

    it('falls back to a bare { key } definition for an undeclared column', async () => {
      const { result } = renderList({
        columnFilters: { docStatus: { type: 'set', values: ['CO'] } },
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(JSON.stringify(criteriaOfCall())).toContain('docStatus');
    });

    it('skips falsy column filter entries', async () => {
      const { result } = renderList({
        columnFilters: { docStatus: null, other: undefined },
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(criteriaOfCall()).toEqual([]);
    });
  });

  describe('merging every filter layer', () => {
    it('collapses baseFilter + columnFilters + trailingFilter into ONE criteria param', async () => {
      const base = JSON.stringify({ fieldName: 'salesTransaction', operator: 'equals', value: true });
      const trailing = JSON.stringify({ fieldName: 'processed', operator: 'equals', value: false });

      const { result } = renderList({
        baseFilter: `criteria=${encodeURIComponent(base)}`,
        columnFilters: { docStatus: { type: 'set', values: ['CO'] } },
        columnDefs: { docStatus: { key: 'docStatus' } },
        trailingFilter: `criteria=${encodeURIComponent(trailing)}`,
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const emitted = criteriaOfCall();
      expect(emitted).toHaveLength(1);

      const parsed = JSON.parse(emitted[0]);
      expect(Array.isArray(parsed)).toBe(true);
      const serialized = JSON.stringify(parsed);
      expect(serialized).toContain('salesTransaction');
      expect(serialized).toContain('docStatus');
      expect(serialized).toContain('processed');
    });

    it('preserves the composition order base → column → trailing', async () => {
      const base = JSON.stringify({ fieldName: 'first' });
      const trailing = JSON.stringify({ fieldName: 'third' });

      const { result } = renderList({
        baseFilter: `criteria=${encodeURIComponent(base)}`,
        trailingFilter: `criteria=${encodeURIComponent(trailing)}`,
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const parsed = JSON.parse(criteriaOfCall()[0]);
      expect(parsed.map(c => c.fieldName)).toEqual(['first', 'third']);
    });

    it('wraps everything in an outer AND when any layer is an AdvancedCriteria', async () => {
      const base = JSON.stringify({ fieldName: 'plain', operator: 'equals', value: 1 });
      const funnel = JSON.stringify({
        _constructor: 'AdvancedCriteria',
        operator: 'or',
        criteria: [{ fieldName: 'x' }, { fieldName: 'y' }],
      });

      const { result } = renderList({
        baseFilter: `criteria=${encodeURIComponent(base)}`,
        trailingFilter: `criteria=${encodeURIComponent(funnel)}`,
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const parsed = JSON.parse(criteriaOfCall()[0]);
      expect(parsed._constructor).toBe('AdvancedCriteria');
      expect(parsed.operator).toBe('and');
      // The OR block stays nested (parenthesized) inside the outer AND.
      expect(parsed.criteria).toHaveLength(2);
      expect(parsed.criteria[1].operator).toBe('or');
    });

    it('keeps a flat array when no layer is an AdvancedCriteria', async () => {
      const base = JSON.stringify([{ fieldName: 'a' }, { fieldName: 'b' }]);
      const { result } = renderList({ baseFilter: `criteria=${encodeURIComponent(base)}` });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const parsed = JSON.parse(criteriaOfCall()[0]);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed._constructor).toBeUndefined();
    });

    it('merges passthrough params from BOTH baseFilter and trailingFilter', async () => {
      const { result } = renderList({
        baseFilter: 'active=true',
        trailingFilter: 'onlyMine=Y',
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const params = paramsOfCall();
      expect(params.get('active')).toBe('true');
      expect(params.get('onlyMine')).toBe('Y');
    });
  });

  describe('applied to loadMore as well', () => {
    it('reuses the same single-criteria composition on the next page', async () => {
      const base = JSON.stringify({ fieldName: 'salesTransaction', operator: 'equals', value: true });
      const rows = Array.from({ length: 75 }, (_, i) => ({ id: `row-${i}` }));

      const { result } = renderList(
        { baseFilter: `criteria=${encodeURIComponent(base)}` },
        rows,
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.hasMore).toBe(true);

      await act(async () => { result.current.loadMore(); });
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

      const params = paramsOfCall(1);
      expect(params.get('_startRow')).toBe('75');
      expect(params.getAll('criteria')).toHaveLength(1);
      expect(JSON.parse(params.getAll('criteria')[0])[0].fieldName).toBe('salesTransaction');
    });
  });
});

describe('useEntity — list row id derivation', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps an existing plain id untouched', async () => {
    const { result } = renderList({}, [{ id: 'ABC', name: 'row' }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].id).toBe('ABC');
  });

  it('derives the id from the trailing segment of $ref', async () => {
    const { result } = renderList({}, [{ $ref: '/sws/neo/spec/header/REF-1/', name: 'row' }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].id).toBe('REF-1');
    expect(result.current.items[0].name).toBe('row');
  });

  it('falls back to the self-named entity column when there is no id or $ref', async () => {
    // NEO returns some entities with the PK under a column named after the
    // entity itself (e.g. { header: 'H-1' }) rather than a plain `id`.
    const { result } = renderList({}, [{ header: 'H-1', name: 'row' }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].id).toBe('H-1');
  });

  it('prefers a plain id over the self-named entity column', async () => {
    const { result } = renderList({}, [{ id: 'REAL', header: 'OTHER' }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].id).toBe('REAL');
  });

  it('leaves a row with no derivable id without one', async () => {
    const { result } = renderList({}, [{ name: 'orphan' }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].id).toBeUndefined();
    expect(result.current.items[0].name).toBe('orphan');
  });

  it('ignores an empty-string id and derives from $ref instead', async () => {
    const { result } = renderList({}, [{ id: '', $ref: '/x/y/FROM-REF' }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].id).toBe('FROM-REF');
  });

  it('passes non-object rows through untouched', async () => {
    const { result } = renderList({}, ['plain-string', 42]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual(['plain-string', 42]);
  });

  it('tolerates a bare array payload instead of the NEO envelope', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'A' }, { id: 'B' }],
    });
    const { result } = renderHook(() => useEntity('header', null, defaultOpts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map(r => r.id)).toEqual(['A', 'B']);
  });
});
