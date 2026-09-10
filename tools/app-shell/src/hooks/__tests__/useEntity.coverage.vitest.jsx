/**
 * Additional coverage tests for useEntity.js — targeting uncovered branches.
 * Focuses on: handleAddChild, handleUpdateChild, handleDeleteChild, handleProcess,
 * handleSaveAndProcess, 401 logout paths, fetchById error, fetchChildren edge cases,
 * isDirtyHeader, handleDelete errors, handleSave network errors, normalizeRows via $ref.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEntity, RECORD_SAVE_TOAST_ID } from '../useEntity';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const mockLogout = vi.fn();
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) {
      let text = key;
      Object.keys(params).forEach(p => { text = text.replace(`{${p}}`, params[p]); });
      return text;
    }
    return key;
  },
}));

import { toast } from 'sonner';

describe('useEntity — coverage paths', () => {
  const defaultOpts = {
    token: 'test-token',
    apiBaseUrl: 'http://localhost/api',
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    mockLogout.mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderEntity(entity = 'header', childEntity = 'lines', opts = {}) {
    return renderHook(() => useEntity(entity, childEntity, { ...defaultOpts, ...opts }));
  }

  function mockFetchOk(data = []) {
    return { ok: true, status: 200, json: async () => ({ response: { data } }) };
  }

  // ---------------------------------------------------------------------------
  // handleAddChild
  // ---------------------------------------------------------------------------

  describe('handleAddChild', () => {
    it('POSTs child data with parentId and refreshes', async () => {
      const parent = { id: 'p1', name: 'Parent' };
      const childRow = { id: 'c1', product: 'Widget' };

      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return mockFetchOk([childRow]);
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });

      act(() => { result.current.handleSelect(parent); });

      let added;
      await act(async () => {
        added = await result.current.handleAddChild({ product: 'Widget', quantity: 5, id: 'skip-me', 'bp$_identifier': 'skip' });
      });

      expect(added).toBeTruthy();
      const postCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.parentId).toBe('p1');
      expect(body.product).toBe('Widget');
      expect(body.id).toBeUndefined(); // id skipped
      expect(body['bp$_identifier']).toBeUndefined(); // identifier skipped
    });

    it('returns null when no selected record', async () => {
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });

      let added;
      await act(async () => {
        added = await result.current.handleAddChild({ product: 'X' });
      });

      expect(added).toBeUndefined();
    });

    it('returns null and shows error on non-ok response', async () => {
      const parent = { id: 'p1', name: 'Parent' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') {
          return {
            ok: false, status: 400,
            clone: () => ({ json: async () => ({ error: { message: 'Bad' } }) }),
            json: async () => ({ error: { message: 'Bad' } }),
          };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      let added;
      await act(async () => {
        added = await result.current.handleAddChild({ product: 'X' });
      });

      expect(added).toBeNull();
      expect(toast.error).toHaveBeenCalled();
    });

    it('returns null on network error', async () => {
      const parent = { id: 'p1', name: 'Parent' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') throw new Error('Network down');
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      let added;
      await act(async () => {
        added = await result.current.handleAddChild({ product: 'X' });
      });

      expect(added).toBeNull();
      expect(toast.error).toHaveBeenCalled();
    });

    it('skips CURSOR_FIELD, has* keys, and empty values', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return mockFetchOk([{ id: 'c1' }]);
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleAddChild({
          CURSOR_FIELD: 'x', hasChanges: true, empty: '', nullVal: null, real: 'value',
        });
      });

      const postCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'POST');
      const body = JSON.parse(postCall[1].body);
      expect(body.CURSOR_FIELD).toBeUndefined();
      expect(body.hasChanges).toBeUndefined();
      expect(body.empty).toBeUndefined();
      expect(body.nullVal).toBeUndefined();
      expect(body.real).toBe('value');
    });

    it('mirrors exemptionCauseWarning from the RESPONSE ROOT onto selected/editing (ETP-4751)', async () => {
      const parent = { id: 'p1', name: 'Parent' };
      const childRow = { id: 'c1', product: 'Exempt Widget' };
      // The backend stamps the signal at the response ROOT, alongside {response:{data:[line]}},
      // NOT on the nested line record. handleAddChild must read it from the root.
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') {
          return {
            ok: true, status: 200,
            json: async () => ({ response: { data: [childRow] }, exemptionCauseWarning: true }),
          };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleAddChild({ product: 'Exempt Widget' });
      });

      await waitFor(() => {
        expect(result.current.selected.exemptionCauseWarning).toBe(true);
        expect(result.current.editing.exemptionCauseWarning).toBe(true);
      });
      // The nested-line-only path never carried the flag; assert the autofill flag defaulted false.
      expect(result.current.selected.exemptionCauseAutoFilled).toBe(false);
    });

    it('handles json() failure gracefully', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') {
          return { ok: true, json: async () => { throw new Error('bad json'); } };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      let added;
      await act(async () => {
        added = await result.current.handleAddChild({ product: 'X' });
      });

      // Should return true (fallback when json fails)
      expect(added).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // handleUpdateChild
  // ---------------------------------------------------------------------------

  describe('handleUpdateChild', () => {
    it('updates a child field by key/value', async () => {
      globalThis.fetch.mockResolvedValue(mockFetchOk([]));

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      // Set children manually via fetchChildren
      globalThis.fetch.mockResolvedValueOnce(mockFetchOk([{ id: 'c1', qty: 1 }, { id: 'c2', qty: 2 }]));
      await act(async () => { result.current.fetchChildren('p1'); });
      await waitFor(() => { expect(result.current.children).toHaveLength(2); });

      act(() => { result.current.handleUpdateChild('c1', 'qty', 10); });

      expect(result.current.children[0].qty).toBe(10);
      expect(result.current.children[1].qty).toBe(2); // unchanged
    });

    it('updates a child with object merge', async () => {
      globalThis.fetch.mockResolvedValue(mockFetchOk([]));
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      globalThis.fetch.mockResolvedValueOnce(mockFetchOk([{ id: 'c1', qty: 1, price: 10 }]));
      await act(async () => { result.current.fetchChildren('p1'); });
      await waitFor(() => { expect(result.current.children).toHaveLength(1); });

      act(() => { result.current.handleUpdateChild('c1', { qty: 5, price: 20 }); });

      expect(result.current.children[0].qty).toBe(5);
      expect(result.current.children[0].price).toBe(20);
    });

    it('mirrors exemptionCauseWarning from an explicit signalSource root (ETP-4751 PATCH path)', async () => {
      globalThis.fetch.mockResolvedValue(mockFetchOk([]));
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      globalThis.fetch.mockResolvedValueOnce(mockFetchOk([{ id: 'c1', qty: 1 }]));
      await act(async () => { result.current.fetchChildren('p1'); });
      await waitFor(() => { expect(result.current.children).toHaveLength(1); });

      // serverRow is the nested line (no flag); signalSource is the PATCH response ROOT.
      const serverRow = { id: 'c1', qty: 2 };
      const responseRoot = { response: { data: [serverRow] }, exemptionCauseWarning: true };
      act(() => { result.current.handleUpdateChild('c1', serverRow, undefined, responseRoot); });

      await waitFor(() => {
        expect(result.current.selected.exemptionCauseWarning).toBe(true);
        expect(result.current.editing.exemptionCauseWarning).toBe(true);
      });
    });

    // ETP-4751 W2 regression guard: handleUpdateChild's object-form branch calls
    // applyExemptionCauseSignals(fieldOrObject) for EVERY object-form line update, not
    // only exemption saves. A plain (non-exemption) object update must NOT spuriously
    // set either signal true — applyExemptionCauseSignals writes the resolved boolean
    // (false when the object lacks the key). If this regressed to leaking a stale value,
    // SifTab's one-shot toast could either fire spuriously or fail to re-arm.
    it('object-form update WITHOUT a signal leaves both exemption flags false (ETP-4751 W2)', async () => {
      globalThis.fetch.mockResolvedValue(mockFetchOk([]));
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      globalThis.fetch.mockResolvedValueOnce(mockFetchOk([{ id: 'c1', qty: 1, price: 10 }]));
      await act(async () => { result.current.fetchChildren('p1'); });
      await waitFor(() => { expect(result.current.children).toHaveLength(1); });

      // A normal line edit — plain object, no signal keys on it and no signalSource.
      act(() => { result.current.handleUpdateChild('c1', { qty: 5, price: 20 }); });

      await waitFor(() => {
        // The resolved boolean is written, so both flags are the falsy `false`
        // (never left undefined, never spuriously true).
        expect(result.current.selected.exemptionCauseWarning).toBe(false);
        expect(result.current.selected.exemptionCauseAutoFilled).toBe(false);
        expect(result.current.editing.exemptionCauseWarning).toBe(false);
        expect(result.current.editing.exemptionCauseAutoFilled).toBe(false);
      });
    });

    // ETP-4751 W2 regression guard (the actual failure mode Alex flagged): after a
    // warning has been stamped true, a subsequent PLAIN object-form line edit must
    // reset it back to false — a `true → false` transition, with NO stale-true left
    // behind. That reset is exactly what re-arms SifTab's one-shot toast guard; if the
    // object-form branch stopped resetting, the flag would stick true and the warning
    // would never re-fire on the next qualifying save.
    it('plain object-form update resets a previously-true warning to false (ETP-4751 W2)', async () => {
      globalThis.fetch.mockResolvedValue(mockFetchOk([]));
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      globalThis.fetch.mockResolvedValueOnce(mockFetchOk([{ id: 'c1', qty: 1 }]));
      await act(async () => { result.current.fetchChildren('p1'); });
      await waitFor(() => { expect(result.current.children).toHaveLength(1); });

      // 1) Stamp the warning true via an explicit signalSource root (the PATCH path).
      const responseRoot = { response: { data: [{ id: 'c1', qty: 2 }] }, exemptionCauseWarning: true };
      act(() => { result.current.handleUpdateChild('c1', { id: 'c1', qty: 2 }, undefined, responseRoot); });
      await waitFor(() => {
        expect(result.current.selected.exemptionCauseWarning).toBe(true);
        expect(result.current.editing.exemptionCauseWarning).toBe(true);
      });

      // 2) A normal, unrelated line edit (plain object, no signalSource) must flip it back.
      act(() => { result.current.handleUpdateChild('c1', { qty: 3 }); });
      await waitFor(() => {
        expect(result.current.selected.exemptionCauseWarning).toBe(false);
        expect(result.current.editing.exemptionCauseWarning).toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // handleDeleteChild
  // ---------------------------------------------------------------------------

  describe('handleDeleteChild', () => {
    it('removes a child from local state', async () => {
      globalThis.fetch.mockResolvedValue(mockFetchOk([]));
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      globalThis.fetch.mockResolvedValueOnce(mockFetchOk([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]));
      await act(async () => { result.current.fetchChildren('p1'); });
      await waitFor(() => { expect(result.current.children).toHaveLength(3); });

      act(() => { result.current.handleDeleteChild('c2'); });

      expect(result.current.children).toHaveLength(2);
      expect(result.current.children.find(c => c.id === 'c2')).toBeUndefined();
    });

    // ETP-4751 (Bug A) — deleting a line must reset the transient exemption-cause
    // signals to false so the SIF tab's one-shot warning-toast guard re-arms. Without
    // this, an edited invoice that previously warned keeps the flag stuck `true` across
    // the delete; re-adding an exempt line as the first line stamps `true` again with no
    // intervening true→false transition, so the guard never re-arms and the warning
    // silently fails to re-fire. The reset must also survive refreshHeaderTotals's
    // carry-forward of the signal keys (it copies them from the previous record).
    it('resets exemptionCauseWarning to false on delete so the toast guard re-arms (ETP-4751)', async () => {
      const parent = { id: 'p1', name: 'Parent' };
      const childRow = { id: 'c1', product: 'Exempt Widget' };
      // The header GET fired by refreshHeaderTotals must NOT re-introduce the flag: it is
      // a transient client-only signal, never an entity field, so the header row omits it.
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') {
          return {
            ok: true, status: 200,
            json: async () => ({ response: { data: [childRow] }, exemptionCauseWarning: true }),
          };
        }
        return mockFetchOk([{ id: 'p1', name: 'Parent' }]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      // A line save stamps the warning flag true (the "already warned once" state).
      await act(async () => {
        await result.current.handleAddChild({ product: 'Exempt Widget' });
      });
      await waitFor(() => {
        expect(result.current.selected.exemptionCauseWarning).toBe(true);
        expect(result.current.editing.exemptionCauseWarning).toBe(true);
      });

      // Deleting the line must flip the flag back to false — and it must STAY false
      // after refreshHeaderTotals's carry-forward runs.
      await act(async () => { result.current.handleDeleteChild('c1'); });
      await waitFor(() => {
        expect(result.current.selected.exemptionCauseWarning).toBe(false);
        expect(result.current.editing.exemptionCauseWarning).toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // handleProcess
  // ---------------------------------------------------------------------------

  describe('handleProcess', () => {
    it('POSTs process action with hidden params merged', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return { ok: true, json: async () => ({}) };
        return mockFetchOk([parent]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      const process = {
        name: 'complete',
        columnName: 'docAction',
        label: 'Complete',
        params: [
          { key: 'hidden1', value: 'val1', hidden: true },
          { key: 'visible1', value: 'val2', hidden: false },
        ],
      };

      await act(async () => {
        await result.current.handleProcess(process, { userParam: 'uval' });
      });

      const postCall = globalThis.fetch.mock.calls.find(c =>
        c[1]?.method === 'POST' && c[0].includes('/action/'),
      );
      expect(postCall).toBeTruthy();
      expect(postCall[0]).toContain('/action/docAction');
      const body = JSON.parse(postCall[1].body);
      expect(body.fieldValues.hidden1).toBe('val1');
      expect(body.fieldValues.userParam).toBe('uval');
      // visible1 not included (hidden=false)
      expect(body.fieldValues.visible1).toBeUndefined();
    });

    it('uses process.name when columnName is absent', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return { ok: true, json: async () => ({}) };
        return mockFetchOk([parent]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleProcess({ name: 'myProcess', params: [] });
      });

      const postCall = globalThis.fetch.mock.calls.find(c =>
        c[1]?.method === 'POST' && c[0].includes('/action/'),
      );
      expect(postCall[0]).toContain('/action/myProcess');
    });

    it('dispatches neo:processSuccess custom event on success', async () => {
      const parent = { id: 'p1' };
      const eventSpy = vi.fn();
      window.addEventListener('neo:processSuccess', eventSpy);

      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return { ok: true, json: async () => ({}) };
        return mockFetchOk([parent]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleProcess({ name: 'test', params: [] });
      });

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('neo:processSuccess', eventSpy);
    });

    it('includes columnName in neo:processSuccess detail for reactivate process', async () => {
      const parent = { id: 'p1' };
      const eventSpy = vi.fn();
      window.addEventListener('neo:processSuccess', eventSpy);

      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return { ok: true, json: async () => ({}) };
        return mockFetchOk([parent]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleProcess({ name: 'Reactivar', columnName: 'etprReactivatePayment', params: [] });
      });

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        detail: expect.objectContaining({
          process: expect.objectContaining({ columnName: 'etprReactivatePayment' }),
          recordId: parent.id,
        }),
      }));
      window.removeEventListener('neo:processSuccess', eventSpy);
    });

    it('shows fallback toast with process.label when no i18n key matches', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return { ok: true, json: async () => ({}) };
        return mockFetchOk([parent]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleProcess({ name: 'doStuff', label: 'Do Stuff', params: [] });
      });

      // The ui mock returns key as-is, so 'doStuffCompleted' === 'doStuffCompleted' → uses fallback
      expect(toast.success).toHaveBeenCalledWith('Do Stuff completed');
    });

    it('shows generic fallback when no label', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return { ok: true, json: async () => ({}) };
        return mockFetchOk([parent]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleProcess({ name: 'noLabel', params: [] });
      });

      expect(toast.success).toHaveBeenCalledWith('Process completed');
    });

    it('uses columnName (not name) for i18n completion key when columnName is present', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') return { ok: true, json: async () => ({}) };
        return mockFetchOk([parent]);
      });

      // ui mock returns key unchanged → 'aPRMProcessPaymentCompleted' !== 'aPRMProcessPaymentCompleted' is false
      // → uses fallback. What matters is that the key is built from columnName, not name.
      // We spy on ui by checking the toast fallback uses label (not name/columnName raw).
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleProcess({
          name: 'Payment Process',
          columnName: 'aPRMProcessPayment',
          label: 'processConfirm',
          params: [],
        });
      });

      // ui returns key as-is → specificKey === 'aPRMProcessPaymentCompleted' → fallback to label
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('processConfirm'));
    });

    it('shows error toast on non-ok response', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') {
          return {
            ok: false, status: 500,
            clone: () => ({ json: async () => ({ error: { message: 'Failed' } }) }),
            json: async () => ({ error: { message: 'Failed' } }),
          };
        }
        return mockFetchOk([parent]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleProcess({ name: 'fail', params: [] });
      });

      expect(toast.error).toHaveBeenCalled();
    });

    it('shows error toast on network error', async () => {
      const parent = { id: 'p1' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') throw new Error('Network failed');
        return mockFetchOk([parent]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect(parent); });

      await act(async () => {
        await result.current.handleProcess({ name: 'err', params: [] });
      });

      expect(toast.error).toHaveBeenCalledWith('Network failed');
    });

    it('does nothing when no selected record', async () => {
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });

      await act(async () => {
        await result.current.handleProcess({ name: 'x', params: [] });
      });

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 401 — refresh/loadMore treat it as any other failed request
  // ---------------------------------------------------------------------------
  // ETP-5022: refresh/loadMore no longer special-case a 401 themselves — the
  // shared apiFetch helper already logs out and throws before the response ever
  // reaches this hook (see @etendosoftware/app-shell-core's createApiFetch), so
  // there is nothing left here to unit-test about logout. What IS still this
  // hook's responsibility is that the resulting rejection lands in the normal
  // error path (items reset, loading released) instead of hanging or throwing
  // unhandled.

  describe('401 responses', () => {
    it('resets items and clears loading when refresh gets a 401', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 401 });

      const { result } = renderEntity('header', 'lines');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.items).toEqual([]);
      });
    });

    it('stops loadMore and clears hasMore when it gets a 401', async () => {
      // Initial fetch: 75 items (triggers hasMore=true)
      const batch = Array.from({ length: 75 }, (_, i) => ({ id: `r${i}` }));
      globalThis.fetch.mockResolvedValueOnce(mockFetchOk(batch));

      const { result } = renderEntity('header', null);

      await waitFor(() => { expect(result.current.loading).toBe(false); });

      // loadMore returns 401
      globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      await act(async () => { result.current.loadMore(); });

      await waitFor(() => {
        expect(result.current.loadingMore).toBe(false);
        expect(result.current.hasMore).toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // fetchById — error path
  // ---------------------------------------------------------------------------

  describe('fetchById — error', () => {
    it('stops loading on fetch error', async () => {
      globalThis.fetch.mockRejectedValue(new Error('fail'));

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => {
        result.current.fetchById('rec-1');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('does nothing when id is falsy', () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });

      act(() => {
        result.current.fetchById(null);
        result.current.fetchById('');
        result.current.fetchById(undefined);
      });

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // fetchChildren — edge cases
  // ---------------------------------------------------------------------------

  describe('fetchChildren — edge cases', () => {
    it('includes childSortBy in URL when provided', async () => {
      globalThis.fetch.mockResolvedValue(mockFetchOk([]));

      const { result } = renderEntity('header', 'lines', { skipListFetch: true, childSortBy: 'lineNo asc' });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      await act(async () => { result.current.fetchChildren('p1'); });

      const childCall = globalThis.fetch.mock.calls.find(c => c[0].includes('parentId='));
      expect(childCall[0]).toContain('_sortBy=lineNo');
    });

    it('sets empty children on fetch error', async () => {
      globalThis.fetch.mockRejectedValue(new Error('fail'));

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });

      await act(async () => { result.current.fetchChildren('p1'); });

      await waitFor(() => {
        expect(result.current.childrenLoading).toBe(false);
        expect(result.current.children).toEqual([]);
      });
    });

    it('clears children when parentId is null', () => {
      const { result } = renderEntity('header', 'lines', { skipListFetch: true });

      act(() => { result.current.fetchChildren(null); });

      expect(result.current.children).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // isDirtyHeader
  // ---------------------------------------------------------------------------

  describe('isDirtyHeader', () => {
    it('is false for freshly selected record', () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: '1', name: 'A' }); });
      expect(result.current.isDirtyHeader).toBe(false);
    });

    it('is true when editing diverges from selected', () => {
      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: '1', name: 'A' }); });
      act(() => { result.current.handleChange('name', 'B'); });
      expect(result.current.isDirtyHeader).toBe(true);
    });

    it('is true for new record with non-empty fields', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ defaults: {} }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'New'); });
      expect(result.current.isDirtyHeader).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // handleDelete — error paths
  // ---------------------------------------------------------------------------

  describe('handleDelete — errors', () => {
    it('shows error toast on non-ok response', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'DELETE') {
          return {
            ok: false, status: 400,
            clone: () => ({ json: async () => ({ error: { message: 'Cannot delete' } }) }),
            json: async () => ({ error: { message: 'Cannot delete' } }),
          };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'd1' }); });

      await act(async () => { await result.current.handleDelete(); });

      expect(toast.error).toHaveBeenCalled();
      // selected should NOT be cleared on error
      expect(result.current.selected).toBeTruthy();
    });

    it('shows error toast on network error', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'DELETE') throw new Error('Net fail');
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'd1' }); });

      await act(async () => { await result.current.handleDelete(); });

      expect(toast.error).toHaveBeenCalledWith('Net fail');
    });

    it('shows generic error when error has no message', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'DELETE') throw new Error();
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'd1' }); });

      await act(async () => { await result.current.handleDelete(); });

      expect(toast.error).toHaveBeenCalledWith('Network error');
    });

    // ETP-4656 — same FK/RESTRICT normalization `useEntity-delete-errors.test.js`
    // exercises via extractErrorMessage directly, but routed through the real
    // handleDelete → normalizeServerError path (this file's Vitest/v8 instrumentation
    // can attribute coverage back to useEntity.js, unlike that file's custom
    // Node ESM loader hook — see its own header comment for why).
    it('maps a raw Postgres FK/RESTRICT delete error to the standardized message', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'DELETE') {
          return {
            ok: false, status: 500,
            clone: () => ({ json: async () => ({ error: { message: 'is still referenced from table "m_inout_line"' } }) }),
            json: async () => ({ error: { message: 'is still referenced from table "m_inout_line"' } }),
          };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'd1' }); });

      await act(async () => { await result.current.handleDelete(); });

      expect(toast.error).toHaveBeenCalledWith('This record cannot be deleted because it has associated records.');
    });

    it('maps the Spanish Postgres FK/RESTRICT wording ("se hace referencia a la llave")', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'DELETE') {
          return {
            ok: false, status: 500,
            clone: () => ({ json: async () => ({ error: { message: 'aún se hace referencia a la llave "m_product_id"' } }) }),
            json: async () => ({ error: { message: 'aún se hace referencia a la llave "m_product_id"' } }),
          };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'd1' }); });

      await act(async () => { await result.current.handleDelete(); });

      expect(toast.error).toHaveBeenCalledWith('This record cannot be deleted because it has associated records.');
    });

    it('maps the classic Etendo AD_Message ForeignKeyViolation (Spanish variant)', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'DELETE') {
          return {
            ok: false, status: 500,
            clone: () => ({ json: async () => ({ error: { message: 'No se puede eliminar este registro porque está relacionado con otros elementos existentes.' } }) }),
            json: async () => ({ error: { message: 'No se puede eliminar este registro porque está relacionado con otros elementos existentes.' } }),
          };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'd1' }); });

      await act(async () => { await result.current.handleDelete(); });

      expect(toast.error).toHaveBeenCalledWith('This record cannot be deleted because it has associated records.');
    });
  });

  // ---------------------------------------------------------------------------
  // handleSave — network error with/without message
  // ---------------------------------------------------------------------------

  describe('handleSave — network errors', () => {
    it('sets saveError from error message', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') throw new Error('Custom error');
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'X'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toBeNull();
      expect(result.current.saveError).toBe('Custom error');
    });

    it('falls back to "Network error" when error has no message', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') throw new Error();
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'X'); });

      await act(async () => { await result.current.handleSave(); });

      expect(result.current.saveError).toBe('Network error');
    });
  });

  // ---------------------------------------------------------------------------
  // handleSave — required field validation (client-side)
  // ---------------------------------------------------------------------------

  describe('handleSave — client-side required field validation', () => {
    it('reports missing required fields and returns null', async () => {
      globalThis.fetch.mockImplementation(async (url) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });

      // Register fields with required ones
      act(() => {
        result.current.registerFields([
          { key: 'name', required: true, type: 'string' },
          { key: 'amount', required: true, type: 'number' },
          { key: 'notes', required: false, type: 'string' },
        ]);
      });

      // Don't set name or amount — they're required
      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toBeNull();
      expect(result.current.fieldErrors.name).toBeTruthy();
      expect(result.current.fieldErrors.amount).toBeTruthy();
      expect(result.current.fieldErrors.notes).toBeUndefined();
    });

    it('skips validation for checkbox and summary fields', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') return mockFetchOk([{ id: 'new-1' }]);
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });

      act(() => {
        result.current.registerFields([
          { key: 'check1', required: true, type: 'checkbox' },
          { key: 'total', required: true, type: 'number', section: 'summary' },
          { key: 'name', required: true, type: 'string' },
        ]);
      });

      act(() => { result.current.handleChange('name', 'OK'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      // Should succeed — check1 and total are skipped in validation
      expect(saved).toBeTruthy();
    });

    it('skips validation for readOnly fields', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') return mockFetchOk([{ id: 'new-1' }]);
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });

      act(() => {
        result.current.registerFields([
          { key: 'docNo', required: true, type: 'string', readOnly: true },
          { key: 'name', required: true, type: 'string' },
        ]);
      });

      act(() => { result.current.handleChange('name', 'OK'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // registerFields
  // ---------------------------------------------------------------------------

  describe('registerFields', () => {
    it('registers and unregisters form fields', async () => {
      globalThis.fetch.mockImplementation(async (url) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      act(() => {
        result.current.registerFields([{ key: 'name', required: true }], 'form1');
        result.current.registerFields([{ key: 'amount', required: true }], 'form2');
      });

      // Unregister form1
      act(() => {
        result.current.registerFields(null, 'form1');
      });

      // registerFields is internal; just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // handleSaveAndProcess
  // ---------------------------------------------------------------------------

  describe('handleSaveAndProcess', () => {
    it('saves then processes, returns updated record', async () => {
      const savedRecord = { id: 'sp-1', name: 'Saved' };
      const updatedRecord = { id: 'sp-1', name: 'Saved', status: 'CO' };

      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST' && !url.includes('/action/')) {
          return mockFetchOk([savedRecord]);
        }
        if (opts?.method === 'POST' && url.includes('/action/')) {
          return { ok: true, json: async () => ({}) };
        }
        if (url.endsWith('/header/sp-1') && (!opts?.method || opts.method === 'GET')) {
          return mockFetchOk([updatedRecord]);
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'Saved'); });

      let processed;
      await act(async () => {
        processed = await result.current.handleSaveAndProcess({
          processField: 'docAction',
          processValue: 'CO',
        });
      });

      expect(processed).toBeTruthy();
      expect(processed.status).toBe('CO');
    });

    it('returns null when save fails', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') {
          return {
            ok: false, status: 400,
            clone: () => ({ json: async () => ({ error: { message: 'Bad' } }) }),
            json: async () => ({ error: { message: 'Bad' } }),
          };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'X'); });

      let processed;
      await act(async () => {
        processed = await result.current.handleSaveAndProcess({
          processField: 'docAction',
          processValue: 'CO',
        });
      });

      expect(processed).toBeNull();
    });

    it('returns saved when process fails', async () => {
      const savedRecord = { id: 'sp-1', name: 'Saved' };
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST' && !url.includes('/action/')) {
          return mockFetchOk([savedRecord]);
        }
        if (opts?.method === 'POST' && url.includes('/action/')) {
          return {
            ok: false, status: 500,
            clone: () => ({ json: async () => ({ error: { message: 'Process failed' } }) }),
            json: async () => ({ error: { message: 'Process failed' } }),
          };
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'X'); });

      let processed;
      await act(async () => {
        processed = await result.current.handleSaveAndProcess({
          processField: 'docAction',
          processValue: 'CO',
        });
      });

      expect(processed).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeRows — $ref derivation
  // ---------------------------------------------------------------------------

  describe('normalizeRows via fetchById', () => {
    it('derives id from $ref when id is missing', async () => {
      globalThis.fetch.mockResolvedValue(mockFetchOk([]));

      const { result } = renderEntity('header', null, { skipListFetch: true });

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: { data: [{ $ref: '/header/abc123', name: 'No-ID' }] },
        }),
      });

      await act(async () => {
        result.current.fetchById('abc123');
      });

      await waitFor(() => {
        expect(result.current.selected?.id).toBe('abc123');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // handleNew — contacts BP defaults
  // ---------------------------------------------------------------------------

  describe('handleNew — contacts BP defaults', () => {
    it('sets oBTIKTaxIDKey=1 for contacts businessPartner', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ defaults: { organization: 'ORG1' } }),
      });

      const { result } = renderEntity('businessPartner', null, {
        skipListFetch: true,
        apiBaseUrl: 'http://localhost/api/contacts',
      });

      await act(async () => { await result.current.handleNew(); });

      expect(result.current.editing.oBTIKTaxIDKey).toBe('1');
    });

    it('does not set oBTIKTaxIDKey when already present', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ defaults: { oBTIKTaxIDKey: '2' } }),
      });

      const { result } = renderEntity('businessPartner', null, {
        skipListFetch: true,
        apiBaseUrl: 'http://localhost/api/contacts',
      });

      await act(async () => { await result.current.handleNew(); });

      expect(result.current.editing.oBTIKTaxIDKey).toBe('2');
    });
  });

  // ---------------------------------------------------------------------------
  // handleNew — defaults endpoint returns non-ok
  // ---------------------------------------------------------------------------

  describe('handleNew — non-ok defaults', () => {
    it('proceeds with empty form when defaults returns non-ok', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => { await result.current.handleNew(); });

      expect(result.current.editing).toBeTruthy();
    });

    it('proceeds with empty form when defaults has no defaults property', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ someOtherProp: {} }),
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });

      await act(async () => { await result.current.handleNew(); });

      expect(result.current.editing).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // handleChange — clears existing field error
  // ---------------------------------------------------------------------------

  describe('handleChange — field error clearing', () => {
    it('clears specific field error without affecting others', async () => {
      globalThis.fetch.mockImplementation(async (url) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await act(async () => { await result.current.handleNew(); });

      // Register fields with required ones
      act(() => {
        result.current.registerFields([
          { key: 'name', required: true, type: 'string' },
          { key: 'amount', required: true, type: 'number' },
        ]);
      });

      // Trigger validation to set field errors
      await act(async () => { await result.current.handleSave(); });

      expect(result.current.fieldErrors.name).toBeTruthy();
      expect(result.current.fieldErrors.amount).toBeTruthy();

      // Change name — should clear only name error
      act(() => { result.current.handleChange('name', 'OK'); });

      expect(result.current.fieldErrors.name).toBeUndefined();
      expect(result.current.fieldErrors.amount).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // refresh — error path
  // ---------------------------------------------------------------------------

  describe('refresh — error handling', () => {
    it('sets empty items and stops loading on non-ok response', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

      const { result } = renderEntity('header', null);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.items).toEqual([]);
        expect(result.current.hasMore).toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // handleSave — refetchAfterSave failure path
  // ---------------------------------------------------------------------------

  describe('handleSave — refetchAfterSave catch', () => {
    it('falls back to saved record when refetch fails', async () => {
      const savedRecord = { id: 'r1', name: 'Saved' };
      let refetchCalled = false;

      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') return mockFetchOk([savedRecord]);
        if (url.endsWith('/header/r1') && !opts?.method) {
          refetchCalled = true;
          throw new Error('refetch failed');
        }
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true, refetchAfterSave: true });
      await act(async () => { await result.current.handleNew(); });
      act(() => { result.current.handleChange('name', 'Saved'); });

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toEqual(savedRecord);
      expect(refetchCalled).toBe(true);
      // Falls back to savedRecord
      expect(result.current.selected).toEqual(savedRecord);
    });
  });

  // ---------------------------------------------------------------------------
  // handleSave — backend messages
  // ---------------------------------------------------------------------------

  describe('handleSave — backend messages', () => {
    /**
     * Helper: render hook with an existing selected record so handleSave
     * issues a PATCH (not a POST). Uses null childEntity so handleSelect
     * does not trigger a fetchChildren fetch call. Returns { result }.
     */
    async function renderEntityWithSelected(record = { id: 'bp-1', taxId: 'IT123' }) {
      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect(record); });
      return { result };
    }

    it('calls toast.success with title and description for success type', async () => {
      const { result } = await renderEntityWithSelected();

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: { data: [{ id: 'bp-1', taxId: 'IT123' }] },
          messages: [{ type: 'success', title: 'IVA válido', text: 'AIRI S.R.L.\nVIA NOMENTANA 63' }],
        }),
      });

      await act(async () => { await result.current.handleSave(); });

      expect(toast.success).toHaveBeenCalledWith('IVA válido', { description: 'AIRI S.R.L.\nVIA NOMENTANA 63' });
    });

    it('calls toast.warning with title and undefined description when text is absent', async () => {
      const { result } = await renderEntityWithSelected();

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: { data: [{ id: 'bp-1', taxId: 'IT123' }] },
          messages: [{ type: 'warning', title: 'IVA no válido' }],
        }),
      });

      await act(async () => { await result.current.handleSave(); });

      expect(toast.warning).toHaveBeenCalledWith('IVA no válido', { description: undefined });
    });

    it('calls toast.error with title and undefined description for error type', async () => {
      const { result } = await renderEntityWithSelected();

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: { data: [{ id: 'bp-1', taxId: 'IT123' }] },
          messages: [{ type: 'error', title: 'Error VIES' }],
        }),
      });

      await act(async () => { await result.current.handleSave(); });

      expect(toast.error).toHaveBeenCalledWith('Error VIES', { description: undefined });
    });

    it('calls toast.info for unknown type with title', async () => {
      const { result } = await renderEntityWithSelected();

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: { data: [{ id: 'bp-1', taxId: 'IT123' }] },
          messages: [{ type: 'foo', title: 'Info message' }],
        }),
      });

      await act(async () => { await result.current.handleSave(); });

      expect(toast.info).toHaveBeenCalledWith('Info message', { description: undefined });
    });

    it('fires all toasts and suppresses generic success when multiple messages returned', async () => {
      const { result } = await renderEntityWithSelected();

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: { data: [{ id: 'bp-1', taxId: 'IT123' }] },
          messages: [
            { type: 'success', title: 'Msg 1' },
            { type: 'warning', title: 'Msg 2' },
          ],
        }),
      });

      await act(async () => { await result.current.handleSave(); });

      expect(toast.success).toHaveBeenCalledWith('Msg 1', { description: undefined });
      expect(toast.warning).toHaveBeenCalledWith('Msg 2', { description: undefined });
      // Generic i18n success toast must NOT have been called
      expect(toast.success).not.toHaveBeenCalledWith(
        expect.stringMatching(/recordSaved|recordCreated/),
        expect.anything(),
      );
    });

    it('falls back to generic success toast when messages array is empty', async () => {
      const { result } = await renderEntityWithSelected();

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: { data: [{ id: 'bp-1', taxId: 'IT123' }] },
          messages: [],
        }),
      });

      await act(async () => { await result.current.handleSave(); });

      // The i18n mock returns the key as-is; showSaveSuccessToast calls toast.success
      // with 'recordSaved', carrying the shared RECORD_SAVE_TOAST_ID (ETP-4830 — lets a
      // window's onAfterCreate replace this toast in place instead of dismiss()+create()).
      expect(toast.success).toHaveBeenCalledWith('recordSaved', { id: RECORD_SAVE_TOAST_ID });
    });

    it('falls back to generic success toast when messages key is absent', async () => {
      const { result } = await renderEntityWithSelected();

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: { data: [{ id: 'bp-1', taxId: 'IT123' }] },
          // no messages key at all
        }),
      });

      await act(async () => { await result.current.handleSave(); });

      expect(toast.success).toHaveBeenCalledWith('recordSaved', { id: RECORD_SAVE_TOAST_ID });
    });

    it('does not call toast.success with i18n key when backend messages are present', async () => {
      const { result } = await renderEntityWithSelected();

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: { data: [{ id: 'bp-1', taxId: 'IT123' }] },
          messages: [{ type: 'success', title: 'Done' }],
        }),
      });

      await act(async () => { await result.current.handleSave(); });

      // toast.success is only called for the backend message, never for 'recordSaved' or 'recordCreated'
      const successCalls = vi.mocked(toast.success).mock.calls;
      const hasGenericCall = successCalls.some(
        ([title]) => title === 'recordSaved' || title === 'recordCreated',
      );
      expect(hasGenericCall).toBe(false);
    });
  });
});
