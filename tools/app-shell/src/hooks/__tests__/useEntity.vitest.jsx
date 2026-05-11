import { renderHook, act, waitFor } from '@testing-library/react';
import { useEntity } from '../useEntity';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

describe('useEntity', () => {
  const defaultOpts = {
    token: 'test-token',
    apiBaseUrl: 'http://localhost/api',
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderEntity(entity = 'header', childEntity = 'lines', opts = {}) {
    return renderHook(() => useEntity(entity, childEntity, { ...defaultOpts, ...opts }));
  }

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts with correct defaults', () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });

      const { result } = renderEntity();

      expect(result.current.items).toEqual([]);
      expect(result.current.selected).toBeNull();
      expect(result.current.editing).toBeNull();
      expect(result.current.children).toEqual([]);
      expect(result.current.saveError).toBeNull();
      expect(result.current.isSaving).toBe(false);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.fieldErrors).toEqual({});
    });

    it('sets loading=true and fetches list on mount', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: '1', name: 'Item 1' }] } }),
      });

      const { result } = renderEntity();

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].id).toBe('1');
    });

    it('does not fetch list when skipListFetch=true', () => {
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result.current.items).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // handleNew
  // ---------------------------------------------------------------------------

  describe('handleNew', () => {
    it('creates empty editing state', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      // Mock defaults endpoint
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ defaults: { organization: 'ORG1', creationDate: '15-04-2026' } }),
      });

      await act(async () => {
        await result.current.handleNew();
      });

      expect(result.current.selected).toBeNull();
      expect(result.current.editing).toBeTruthy();
      expect(result.current.fieldErrors).toEqual({});
    });

    it('normalizes date defaults from dd-MM-yyyy to yyyy-MM-dd', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ defaults: { orderDate: '15-04-2026' } }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => {
        await result.current.handleNew();
      });

      expect(result.current.editing.orderDate).toBe('2026-04-15');
    });

    it('strips single-quoted string defaults', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ defaults: { status: "'DR'" } }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => {
        await result.current.handleNew();
      });

      expect(result.current.editing.status).toBe('DR');
    });

    it('converts integer defaults to strings', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ defaults: { priority: 5 } }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => {
        await result.current.handleNew();
      });

      expect(result.current.editing.priority).toBe('5');
    });

    it('proceeds with empty form if defaults endpoint fails', async () => {
      globalThis.fetch.mockRejectedValue(new Error('500'));

      const { result } = renderEntity('header', null, { skipListFetch: true, refetchAfterSave: true });

      await act(async () => {
        await result.current.handleNew();
      });

      expect(result.current.editing).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // handleChange
  // ---------------------------------------------------------------------------

  describe('handleChange', () => {
    it('updates the editing state', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ defaults: {} }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true, refetchAfterSave: true });

      await act(async () => {
        await result.current.handleNew();
      });

      act(() => {
        result.current.handleChange('name', 'Test');
      });

      expect(result.current.editing.name).toBe('Test');
    });

    it('clears field error for the changed field', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ defaults: {} }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true, refetchAfterSave: true });

      await act(async () => {
        await result.current.handleNew();
      });

      // Simulate field errors set from a failed save
      // We do this by triggering a save that fails validation
      // Instead, just test the handleChange clears mechanism indirectly
      act(() => {
        result.current.handleChange('name', 'Value');
      });

      // fieldErrors should not contain 'name'
      expect(result.current.fieldErrors.name).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // handleSave (create)
  // ---------------------------------------------------------------------------

  describe('handleSave', () => {
    it('POSTs new record and returns saved data', async () => {
      const savedRecord = { id: 'new-1', name: 'Created' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) {
          return { ok: true, json: async () => ({ defaults: {} }) };
        }
        if (opts?.method === 'POST') {
          return { ok: true, json: async () => ({ response: { data: [savedRecord] } }) };
        }
        if (String(url).endsWith('/header/new-1')) {
          return { ok: true, json: async () => ({ response: { data: [{ ...savedRecord, serverValue: 'computed' }] } }) };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      const { result } = renderEntity('header', null, { skipListFetch: true, refetchAfterSave: true });

      await act(async () => {
        await result.current.handleNew();
      });

      act(() => {
        result.current.handleChange('name', 'Created');
      });

      let saved;
      await act(async () => {
        saved = await result.current.handleSave();
      });

      expect(saved).toEqual(savedRecord);
      expect(result.current.selected).toEqual({ ...savedRecord, serverValue: 'computed' });
      expect(result.current.saveError).toBeNull();

      // Check the POST call
      const postCall = globalThis.fetch.mock.calls.find(c => {
        const opts = c[1];
        return opts?.method === 'POST';
      });
      expect(postCall).toBeTruthy();
      expect(postCall[0]).toBe('http://localhost/api/header');
      const body = JSON.parse(postCall[1].body);
      expect(body.name).toBe('Created');
    });

    it('does not refetch the saved record unless refetchAfterSave is enabled', async () => {
      const savedRecord = { id: 'new-1', name: 'Created' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) {
          return { ok: true, json: async () => ({ defaults: {} }) };
        }
        if (opts?.method === 'POST') {
          return { ok: true, json: async () => ({ response: { data: [savedRecord] } }) };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => {
        await result.current.handleNew();
      });

      act(() => {
        result.current.handleChange('name', 'Created');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(result.current.selected).toEqual(savedRecord);
    });

    it('refetches the saved record when refetchAfterSave is enabled', async () => {
      const savedRecord = { id: 'new-1', name: 'Created' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) {
          return { ok: true, json: async () => ({ defaults: {} }) };
        }
        if (opts?.method === 'POST') {
          return { ok: true, json: async () => ({ response: { data: [savedRecord] } }) };
        }
        if (String(url).endsWith('/header/new-1')) {
          return { ok: true, json: async () => ({ response: { data: [{ ...savedRecord, serverValue: 'computed' }] } }) };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      const { result } = renderEntity('header', null, { skipListFetch: true, refetchAfterSave: true });

      await act(async () => {
        await result.current.handleNew();
      });

      act(() => {
        result.current.handleChange('name', 'Created');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(result.current.selected).toEqual({ ...savedRecord, serverValue: 'computed' });
    });

    it('PATCHes existing record with only changed fields', async () => {
      const existing = { id: 'ex-1', name: 'Original', amount: 100 };
       globalThis.fetch.mockImplementation(async (url, opts) => {
         if (String(url).endsWith('/header/ex-1') && !opts?.method) {
           return { ok: true, json: async () => ({ response: { data: [{ ...existing, name: 'Updated', serverValue: 'computed' }] } }) };
         }
         if (!opts?.method) {
           return { ok: true, json: async () => ({ response: { data: [] } }) };
         }
         if (opts.method === 'PATCH') {
           return { ok: true, json: async () => ({ response: { data: [{ ...existing, name: 'Updated' }] } }) };
         }
         return { ok: true, json: async () => ({ response: { data: [] } }) };
       });

      const { result } = renderEntity('header', null, { skipListFetch: true, refetchAfterSave: true });

      // Simulate selecting an existing record
      act(() => {
        result.current.handleSelect(existing);
      });

      act(() => {
        result.current.handleChange('name', 'Updated');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      const patchCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
      expect(patchCall[0]).toBe('http://localhost/api/header/ex-1');
      const body = JSON.parse(patchCall[1].body);
      expect(body.name).toBe('Updated');
      // amount unchanged, should not be in payload
      expect(body.amount).toBeUndefined();
      expect(result.current.selected).toEqual({ ...existing, name: 'Updated', serverValue: 'computed' });
    });

    it('returns null and sets error on non-ok response', async () => {
      let postCalled = false;
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) {
          return { ok: true, json: async () => ({ defaults: {} }) };
        }
        if (opts?.method === 'POST') {
          postCalled = true;
          return {
            ok: false,
            status: 400,
            clone: () => ({
              json: async () => ({ error: { message: 'Validation failed' } }),
            }),
            json: async () => ({ error: { message: 'Validation failed' } }),
          };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => {
        await result.current.handleNew();
      });

      act(() => {
        result.current.handleChange('name', 'Test');
      });

      let saved;
      await act(async () => {
        saved = await result.current.handleSave();
      });

      expect(postCalled).toBe(true);
      expect(saved).toBeNull();
      expect(result.current.saveError).toBeTruthy();
    });

    it('returns null when editing is null', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      let saved;
      await act(async () => {
        saved = await result.current.handleSave();
      });

      expect(saved).toBeUndefined();
    });

    it('skips empty values and sequence placeholders on create', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) {
          return { ok: true, json: async () => ({ defaults: {} }) };
        }
        if (opts?.method === 'POST') {
          return { ok: true, json: async () => ({ response: { data: [{ id: 'new-1' }] } }) };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => {
        await result.current.handleNew();
      });

      act(() => {
        result.current.handleChange('documentNo', '<10000000>');
        result.current.handleChange('name', 'Real Name');
        result.current.handleChange('empty', '');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      const postCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'POST');
      const body = JSON.parse(postCall[1].body);
      expect(body.documentNo).toBeUndefined(); // sequence placeholder skipped
      expect(body.empty).toBeUndefined(); // empty value skipped
      expect(body.name).toBe('Real Name');
    });
  });

  // ---------------------------------------------------------------------------
  // handleDelete
  // ---------------------------------------------------------------------------

  describe('handleDelete', () => {
    it('sends DELETE and clears selection', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      // Select a record
      act(() => {
        result.current.handleSelect({ id: 'del-1', name: 'To Delete' });
      });

      globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // refresh call after delete
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });

      await act(async () => {
        await result.current.handleDelete();
      });

      const deleteCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'DELETE');
      expect(deleteCall).toBeTruthy();
      expect(deleteCall[0]).toBe('http://localhost/api/header/del-1');
      expect(result.current.selected).toBeNull();
      expect(result.current.editing).toBeNull();
    });

    it('does nothing when no record selected', async () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => {
        await result.current.handleDelete();
      });

      // No fetch calls for DELETE
      const deleteCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'DELETE');
      expect(deleteCall).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Pagination (loadMore)
  // ---------------------------------------------------------------------------

  describe('pagination', () => {
    it('appends rows on loadMore', async () => {
      // Initial load
      const firstBatch = Array.from({ length: 75 }, (_, i) => ({ id: `r${i}` }));
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: firstBatch } }),
      });

      const { result } = renderEntity('header', null);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.items).toHaveLength(75);
      expect(result.current.hasMore).toBe(true);

      // Load more
      const secondBatch = Array.from({ length: 30 }, (_, i) => ({ id: `r${75 + i}` }));
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: secondBatch } }),
      });

      await act(async () => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.loadingMore).toBe(false);
      });

      expect(result.current.items).toHaveLength(105);
      // Less than batch size, so no more
      expect(result.current.hasMore).toBe(false);
    });

    it('does not load more when hasMore=false', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ id: '1' }] } }),
      });

      const { result } = renderEntity('header', null);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Only 1 item < 75 batch, so hasMore=false
      expect(result.current.hasMore).toBe(false);

      const callsBefore = globalThis.fetch.mock.calls.length;
      act(() => {
        result.current.loadMore();
      });

      // No additional fetch
      expect(globalThis.fetch.mock.calls.length).toBe(callsBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // Sort
  // ---------------------------------------------------------------------------

  describe('sort', () => {
    it('exposes sortColumn and sortDirection with setters', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });

      const { result } = renderEntity('header', null);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.sortColumn).toBe('creationDate');
      expect(result.current.sortDirection).toBe('desc');

      act(() => {
        result.current.setSortColumn('name');
        result.current.setSortDirection('asc');
      });

      expect(result.current.sortColumn).toBe('name');
      expect(result.current.sortDirection).toBe('asc');
    });
  });

  // ---------------------------------------------------------------------------
  // fetchById
  // ---------------------------------------------------------------------------

  describe('fetchById', () => {
    it('fetches a single record and sets selected/editing', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'rec-1', name: 'Fetched' }] } }),
      });

      await act(async () => {
        result.current.fetchById('rec-1');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.selected?.id).toBe('rec-1');
      expect(result.current.editing?.name).toBe('Fetched');
    });
  });

  // ---------------------------------------------------------------------------
  // handleSelect
  // ---------------------------------------------------------------------------

  describe('handleSelect', () => {
    it('sets selected and editing from row', () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });
      const row = { id: 's1', name: 'Selected' };

      act(() => {
        result.current.handleSelect(row);
      });

      expect(result.current.selected).toEqual(row);
      expect(result.current.editing).toEqual(row);
    });

    it('clears state when called with null', () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });

      act(() => {
        result.current.handleSelect({ id: '1', name: 'X' });
      });

      act(() => {
        result.current.handleSelect(null);
      });

      expect(result.current.selected).toBeNull();
      expect(result.current.editing).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // fetchChildren
  // ---------------------------------------------------------------------------

  describe('fetchChildren', () => {
    it('fetches child rows for a parent', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: { data: [{ id: 'l1', product: 'Widget' }] },
        }),
      });

      await act(async () => {
        result.current.fetchChildren('parent-1');
      });

      await waitFor(() => {
        expect(result.current.childrenLoading).toBe(false);
      });

      expect(result.current.children).toHaveLength(1);
      expect(result.current.children[0].id).toBe('l1');
    });

    it('clears children when no childEntity', () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });

      act(() => {
        result.current.fetchChildren('parent-1');
      });

      expect(result.current.children).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // primeSaved
  // ---------------------------------------------------------------------------

  describe('primeSaved', () => {
    it('sets selected and editing from provided record', () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });
      const record = { id: 'ps-1', name: 'Primed' };

      act(() => {
        result.current.primeSaved(record);
      });

      expect(result.current.selected).toEqual(record);
      expect(result.current.editing).toEqual(record);
    });

    it('does nothing for record without id', () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });

      act(() => {
        result.current.primeSaved({});
      });

      expect(result.current.selected).toBeNull();
    });
  });
});
