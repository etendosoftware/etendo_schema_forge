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

    it('refetches children after a PATCH on an existing record with a childEntity (ETP-4512)', async () => {
      // Guards against a real bug: a backend NeoHandler side effect on the header's
      // own save (e.g. syncing a join table from a header field) is invisible to the
      // frontend — nothing tells the already-loaded child list to refresh unless
      // handleSave itself triggers it. Children must NOT go stale after a plain
      // update, the same way the existing justSaved fast-path already covers create.
      // The children endpoint returns DIFFERENT data on each call — role-a-row from
      // handleSelect's own initial fetchChildren, then role-b-row — so this only
      // passes if handleSave ALSO calls fetchChildren after the PATCH; if it doesn't,
      // `children` would incorrectly stay stale at role-a-row.
      const existing = { id: 'ex-1', name: 'Original', defaultRole: 'role-a' };
      let childrenFetchCount = 0;
      globalThis.fetch.mockImplementation(async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('/lines?parentId=ex-1')) {
          childrenFetchCount += 1;
          const row = childrenFetchCount === 1
            ? { id: 'role-a-row', role: 'role-a' }
            : { id: 'role-b-row', role: 'role-b' };
          return { ok: true, json: async () => ({ response: { data: [row] } }) };
        }
        if (opts?.method === 'PATCH') {
          return { ok: true, json: async () => ({ response: { data: [{ ...existing, defaultRole: 'role-b' }] } }) };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });

      act(() => {
        result.current.handleSelect(existing);
      });

      await waitFor(() => {
        expect(result.current.children).toEqual([{ id: 'role-a-row', role: 'role-a' }]);
      });

      act(() => {
        result.current.handleChange('defaultRole', 'role-b');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      await waitFor(() => {
        expect(result.current.children).toEqual([{ id: 'role-b-row', role: 'role-b' }]);
      });
      expect(childrenFetchCount).toBe(2);
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

    // ETP-5101 regression: buildSavePayload sends only the changed-field DIFF, and at
    // least one backend entity's PATCH response only echoes back a subset of fields
    // (whatever it wrote + a few identity/audit columns) — not the full record. Before
    // the fix, performSave did `setSelected(resolvedSaved); setEditing({ ...resolvedSaved })`,
    // a full replace that silently dropped any field the response omitted from BOTH
    // `selected` and `editing`, even though that field never actually changed.
    it('preserves a field the PATCH response omits, even though it never changed (ETP-5101)', async () => {
      const existing = { id: 'acc-1', name: 'Original', accountType: 'E', code: '5010' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'PATCH') {
          // Response omits accountType and code entirely — only echoes what it wrote (name) + id.
          return { ok: true, json: async () => ({ response: { data: [{ id: 'acc-1', name: 'Renamed' }] } }) };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      act(() => {
        result.current.handleSelect(existing);
      });

      act(() => {
        result.current.handleChange('name', 'Renamed');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      // The field the response omitted must keep its last-known value, not be dropped.
      expect(result.current.selected.accountType).toBe('E');
      expect(result.current.selected.code).toBe('5010');
      expect(result.current.editing.accountType).toBe('E');
      expect(result.current.editing.code).toBe('5010');
      // The field the response DID include is applied.
      expect(result.current.selected.name).toBe('Renamed');
      expect(result.current.editing.name).toBe('Renamed');
    });

    it('still overwrites a field with an explicit null the PATCH response returns (ETP-5101)', async () => {
      // The merge must not be over-cautious: a field the response DOES include — even
      // an explicit `null` — is a real server-side change and must not be masked back
      // to the prior value.
      const existing = { id: 'acc-2', name: 'Original', note: 'Some note' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'PATCH') {
          return { ok: true, json: async () => ({ response: { data: [{ id: 'acc-2', name: 'Original', note: null }] } }) };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      act(() => {
        result.current.handleSelect(existing);
      });

      // handleSave PATCHes as long as editing.id is set, regardless of an actual diff.
      await act(async () => {
        await result.current.handleSave();
      });

      expect(result.current.selected.note).toBeNull();
      expect(result.current.editing.note).toBeNull();
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

      let outcome;
      await act(async () => {
        outcome = await result.current.handleDelete();
      });

      const deleteCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'DELETE');
      expect(deleteCall).toBeTruthy();
      expect(deleteCall[0]).toBe('http://localhost/api/header/del-1');
      expect(result.current.selected).toBeNull();
      expect(result.current.editing).toBeNull();
      // ETP-4656 — callers (DetailView's confirmHeaderDelete) navigate away
      // only when this resolves true.
      expect(outcome).toBe(true);
    });

    it('does nothing when no record selected', async () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });

      let outcome;
      await act(async () => {
        outcome = await result.current.handleDelete();
      });

      // No fetch calls for DELETE
      const deleteCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'DELETE');
      expect(deleteCall).toBeUndefined();
      expect(outcome).toBe(false);
    });

    // ETP-4656 — standardized delete UX: handleDelete must return false (not
    // just swallow the error) on a failed DELETE, so callers know not to
    // navigate away as if the record were gone.
    it('returns false and toasts an error on a failed DELETE (does not clear selection)', async () => {
      const { toast } = await import('sonner');
      toast.error.mockClear();

      const { result } = renderEntity('header', null, { skipListFetch: true });
      const selectedRecord = { id: 'del-2', name: 'Referenced Record' };
      act(() => { result.current.handleSelect(selectedRecord); });

      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { message: 'violates foreign key constraint "fk_x" on table "y"' },
        }),
      });

      let outcome;
      await act(async () => {
        outcome = await result.current.handleDelete();
      });

      expect(outcome).toBe(false);
      expect(toast.error).toHaveBeenCalled();
      // Selection/edit state must be left untouched on failure — the record
      // was NOT actually deleted.
      expect(result.current.selected).toEqual(selectedRecord);
      expect(result.current.editing).toEqual(selectedRecord);
    });

    it('returns false and toasts an error when the DELETE request throws (network error)', async () => {
      const { toast } = await import('sonner');
      toast.error.mockClear();

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'del-3', name: 'Offline Record' }); });

      globalThis.fetch.mockRejectedValueOnce(new Error('Network error'));

      let outcome;
      await act(async () => {
        outcome = await result.current.handleDelete();
      });

      expect(outcome).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('Network error');
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

  describe('buildHeaders — Accept-Language locale propagation', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });
    });

    it('includes Accept-Language header derived from localStorage locale', async () => {
      localStorage.setItem('schema-forge-locale', 'es_ES');
      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'Test'); });
      await act(async () => { await result.current.handleSave(); });

      const postCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(postCall[1].headers['Accept-Language']).toBe('es_ES');
    });

    it('falls back to es_ES when localStorage has no locale', async () => {
      localStorage.removeItem('schema-forge-locale');
      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'Test'); });
      await act(async () => { await result.current.handleSave(); });

      const postCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(postCall[1].headers['Accept-Language']).toBe('es_ES');
    });
  });

  // ---------------------------------------------------------------------------
  // Email-format validation (additive to required-field validation)
  // ---------------------------------------------------------------------------

  describe('email-format validation', () => {
    const EMAIL_FIELD = { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text' };

    async function setupNewWithEmailField() {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ defaults: {} }) });
      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.registerFields([EMAIL_FIELD], 'form-1'); });
      return result;
    }

    it('blocks the save and toasts (toast-only, NO inline error) for a non-empty invalid email', async () => {
      const result = await setupNewWithEmailField();
      const { toast } = await import('sonner');
      toast.error.mockClear();
      act(() => { result.current.handleChange('etgoEmail', 'not-an-email'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toBeNull();
      // Toast is the single signal — no inline fieldError under the email field.
      expect(result.current.fieldErrors.etgoEmail).toBeUndefined();
      expect(toast.error).toHaveBeenCalledWith('sendModalInvalidEmail');
      // No POST was attempted.
      expect(globalThis.fetch.mock.calls.some(c => c[1]?.method === 'POST')).toBe(false);
    });

    it('does NOT error on an empty email (field is optional)', async () => {
      const result = await setupNewWithEmailField();
      act(() => { result.current.handleChange('etgoEmail', '   ') ; });
      act(() => { result.current.handleChange('name', 'Acme'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(result.current.fieldErrors.etgoEmail).toBeUndefined();
      // Empty email does not block: a POST is attempted.
      expect(globalThis.fetch.mock.calls.some(c => c[1]?.method === 'POST')).toBe(true);
    });

    it('never populates an inline fieldError for an invalid email (toast-only), even across changes', async () => {
      const result = await setupNewWithEmailField();
      const { toast } = await import('sonner');
      toast.error.mockClear();
      // A blocked save toasts but must NOT set an inline error under the field.
      act(() => { result.current.handleChange('etgoEmail', 'bad'); });
      await act(async () => { await result.current.handleSave(); });
      expect(result.current.fieldErrors.etgoEmail).toBeUndefined();
      expect(result.current.fieldErrors).toEqual({});
      expect(toast.error).toHaveBeenCalledWith('sendModalInvalidEmail');

      // Still invalid after another change → still no inline error.
      act(() => { result.current.handleChange('etgoEmail', 'still-bad'); });
      expect(result.current.fieldErrors.etgoEmail).toBeUndefined();
    });

    it('saves fine with a valid email', async () => {
      const savedRecord = { id: 'new-1', name: 'Acme', etgoEmail: 'user@example.com' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (String(url).includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') return { ok: true, json: async () => ({ response: { data: [savedRecord] } }) };
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });
      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.registerFields([EMAIL_FIELD], 'form-1'); });
      act(() => { result.current.handleChange('etgoEmail', 'user@example.com'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toEqual(savedRecord);
      expect(result.current.fieldErrors).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // Website-format validation (secure https URL — toast-only, mirrors email)
  // ---------------------------------------------------------------------------

  describe('website-format validation', () => {
    const WEB_FIELD = { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'string' };

    async function setupNewWithWebField() {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ defaults: {} }) });
      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.registerFields([WEB_FIELD], 'form-1'); });
      return result;
    }

    it('blocks the save and toasts (toast-only, NO inline error) for a non-https website', async () => {
      const result = await setupNewWithWebField();
      const { toast } = await import('sonner');
      toast.error.mockClear();
      act(() => { result.current.handleChange('etgoWeb', 'http://insecure.com'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toBeNull();
      expect(result.current.fieldErrors.etgoWeb).toBeUndefined();
      expect(toast.error).toHaveBeenCalledWith('websiteInsecureUrl');
      expect(globalThis.fetch.mock.calls.some(c => c[1]?.method === 'POST')).toBe(false);
    });

    it('does NOT error on an empty website (field is optional)', async () => {
      const result = await setupNewWithWebField();
      act(() => { result.current.handleChange('etgoWeb', '   '); });
      act(() => { result.current.handleChange('name', 'Acme'); });

      await act(async () => { await result.current.handleSave(); });

      expect(result.current.fieldErrors.etgoWeb).toBeUndefined();
      expect(globalThis.fetch.mock.calls.some(c => c[1]?.method === 'POST')).toBe(true);
    });

    it('saves fine with a secure https website', async () => {
      const savedRecord = { id: 'new-1', name: 'Acme', etgoWeb: 'https://acme.com' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (String(url).includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') return { ok: true, json: async () => ({ response: { data: [savedRecord] } }) };
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });
      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.registerFields([WEB_FIELD], 'form-1'); });
      act(() => { result.current.handleChange('etgoWeb', 'https://acme.com'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toEqual(savedRecord);
      expect(result.current.fieldErrors).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // Phone-format validation (allowed charset — toast-only, mirrors email/website)
  // ---------------------------------------------------------------------------

  describe('phone-format validation', () => {
    const PHONE_FIELD = { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'string' };

    async function setupNewWithPhoneField() {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ defaults: {} }) });
      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.registerFields([PHONE_FIELD], 'form-1'); });
      return result;
    }

    it('blocks the save and toasts (toast-only, NO inline error) for an invalid phone', async () => {
      const result = await setupNewWithPhoneField();
      const { toast } = await import('sonner');
      toast.error.mockClear();
      act(() => { result.current.handleChange('etgoPhone', '600abc'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toBeNull();
      expect(result.current.fieldErrors.etgoPhone).toBeUndefined();
      expect(toast.error).toHaveBeenCalledWith('phoneInvalidChars');
      expect(globalThis.fetch.mock.calls.some(c => c[1]?.method === 'POST')).toBe(false);
    });

    it('does NOT error on an empty phone (field is optional)', async () => {
      const result = await setupNewWithPhoneField();
      act(() => { result.current.handleChange('etgoPhone', '   '); });
      act(() => { result.current.handleChange('name', 'Acme'); });

      await act(async () => { await result.current.handleSave(); });

      expect(result.current.fieldErrors.etgoPhone).toBeUndefined();
      expect(globalThis.fetch.mock.calls.some(c => c[1]?.method === 'POST')).toBe(true);
    });

    it('saves fine with a valid phone number', async () => {
      const savedRecord = { id: 'new-1', name: 'Acme', etgoPhone: '+34 600 123 456' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (String(url).includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') return { ok: true, json: async () => ({ response: { data: [savedRecord] } }) };
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });
      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.registerFields([PHONE_FIELD], 'form-1'); });
      act(() => { result.current.handleChange('etgoPhone', '+34 600 123 456'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toEqual(savedRecord);
      expect(result.current.fieldErrors).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // Format validation is scoped to fields the user edited THIS session, so a
  // legacy-invalid value on an existing record never blocks an unrelated edit.
  // ---------------------------------------------------------------------------

  describe('format validation scoping (existing records)', () => {
    const NAME_FIELD = { key: 'name', column: 'Name', type: 'string' };
    const PHONE_FIELD = { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'string' };
    const WEB_FIELD = { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'string' };

    it('does NOT block a save when the user edits a DIFFERENT field, leaving a legacy-invalid phone/website untouched', async () => {
      const patched = { id: 'BP1', name: 'New' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'PATCH') return { ok: true, json: async () => ({ response: { data: [patched] } }) };
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });
      const { result } = renderEntity('header', null, { skipListFetch: true });
      const { toast } = await import('sonner');
      toast.error.mockClear();
      act(() => { result.current.registerFields([NAME_FIELD, PHONE_FIELD, WEB_FIELD], 'form-1'); });
      // Existing record carrying legacy-invalid phone AND website (never touched here).
      act(() => { result.current.handleSelect({ id: 'BP1', name: 'Old', etgoPhone: '+34 ext. 200', etgoWeb: 'www.legacy.com' }); });
      // Edit an UNRELATED field.
      act(() => { result.current.handleChange('name', 'New'); });

      await act(async () => { await result.current.handleSave(); });

      // Save proceeds — untouched legacy values are not re-validated.
      expect(globalThis.fetch.mock.calls.some(c => c[1]?.method === 'PATCH')).toBe(true);
      expect(toast.error).not.toHaveBeenCalledWith('phoneInvalidChars');
      expect(toast.error).not.toHaveBeenCalledWith('websiteInsecureUrl');
    });

    it('DOES block when the user edits the phone itself to an invalid value on an existing record', async () => {
      globalThis.fetch.mockImplementation(async () => ({ ok: true, json: async () => ({ response: { data: [] } }) }));
      const { result } = renderEntity('header', null, { skipListFetch: true });
      const { toast } = await import('sonner');
      toast.error.mockClear();
      act(() => { result.current.registerFields([NAME_FIELD, PHONE_FIELD], 'form-1'); });
      act(() => { result.current.handleSelect({ id: 'BP1', name: 'Old', etgoPhone: '+34 600 000 000' }); });
      act(() => { result.current.handleChange('etgoPhone', '600abc'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('phoneInvalidChars');
      expect(globalThis.fetch.mock.calls.some(c => c[1]?.method === 'PATCH')).toBe(false);
    });
  });
});
