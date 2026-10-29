// @covers tools/app-shell/src/hooks/useGridView.js
import { act, renderHook, waitFor } from '@testing-library/react';

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

import { gridViewColumnId, useGridView } from '../useGridView.js';

const columns = [
  { key: 'documentNo', column: 'DocumentNo', label: 'Document number' },
  { key: 'name', column: 'Name', label: 'Name' },
  { key: 'status', column: 'DocStatus', label: 'Status', gridConfigurable: false, gridReorderable: false },
  { key: 'total', column: 'GrandTotal', label: 'Total', minWidth: 220 },
];

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

async function settleLoad(result) {
  await waitFor(() => expect(result.current.loading).toBe(false));
}

describe('useGridView', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('uses stable, untranslated field identities rather than the header label', () => {
    expect(gridViewColumnId(columns[0])).toBe(gridViewColumnId({ ...columns[0], label: 'Número de documento' }));
    expect(gridViewColumnId(columns[0])).not.toBe(gridViewColumnId({ key: 'documentNo', column: 'OtherDocumentNo' }));
  });

  it('normalizes stale, duplicate, unknown, unauthorized and malformed saved columns', async () => {
    const first = gridViewColumnId(columns[0]);
    const name = gridViewColumnId(columns[1]);
    const locked = gridViewColumnId(columns[2]);
    const explicit = gridViewColumnId(columns[3]);
    mockApiFetch.mockResolvedValue(response({
      version: 1,
      surface: 'list',
      columns: [
        { id: 'list:field:removed', visible: false, order: -9, width: 500 },
        { id: locked, visible: false, order: 0, width: 90 },
        { id: name, visible: false, order: 1, width: 0 },
        { id: name, visible: true, order: 2, width: 260 },
        { id: first, visible: true, order: 3, width: 1600 },
        { id: explicit, visible: true, order: 4, width: 400 },
      ],
    }));
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns, data: [], enabled: true, apiBaseUrl: '/api' }));
    await settleLoad(result);

    expect(result.current.columnOrder).toEqual([locked, name, first, explicit]);
    expect(result.current.columnVisibility).toEqual({ [name]: false });
    expect(result.current.columnSizing).toEqual({ [name]: 48, [first]: 1200, [explicit]: 400 });
    expect(result.current.columns.map((column) => column.key)).toEqual(['status', 'documentNo', 'total']);
    expect(result.current.columns.find((column) => column.key === 'total').gridUserWidthPx).toBe(400);
  });

  it('keeps defaults and allows any grid width over column default widths', async () => {
    mockApiFetch.mockResolvedValue(response(null, 204));
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns, data: [], enabled: true }));
    await settleLoad(result);
    const nameId = gridViewColumnId(columns[1]);
    const explicitId = gridViewColumnId(columns[3]);

    expect(result.current.columnSizing).toEqual({});
    expect(result.current.isResizable(explicitId)).toBe(true);
    expect(result.current.widthBounds(nameId)).toEqual({ min: 48, max: 1200 });
    act(() => result.current.resizeBy(nameId, -500));
    act(() => result.current.resizeBy(explicitId, -500));
    expect(result.current.columnSizing).toEqual({ [nameId]: 48, [explicitId]: 48 });
    expect(result.current.dirty).toBe(true);
  });
  it('allows resizing required columns without allowing them to be hidden', async () => {
    mockApiFetch.mockResolvedValue(response(null, 204));
    const requiredColumn = {
      key: 'documentNo',
      column: 'DocumentNo',
      label: 'Document number',
      required: true,
      gridDefaultWidthPx: 200,
    };
    const { result } = renderHook(() => useGridView({
      spec: 'goods-shipment',
      entity: 'header',
      columns: [requiredColumn],
      data: [],
      enabled: true,
    }));
    await settleLoad(result);

    const id = gridViewColumnId(requiredColumn);
    expect(result.current.isResizable(id)).toBe(true);
    expect(result.current.canHide(id)).toBe(false);
    expect(result.current.widthBounds(id)).toEqual({ min: 48, max: 1200 });

    act(() => result.current.resizeBy(id, -1000));
    expect(result.current.columnSizing).toEqual({ [id]: 48 });
    act(() => result.current.resizeBy(id, 24));
    expect(result.current.columnSizing).toEqual({ [id]: 72 });
    expect(result.current.canHide(id)).toBe(false);
  });


  it('moves reorderable columns by pointer-equivalent and keyboard actions but protects locked columns', async () => {
    mockApiFetch.mockResolvedValue(response(null, 204));
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns, data: [], enabled: true }));
    await settleLoad(result);
    const first = gridViewColumnId(columns[0]);
    const name = gridViewColumnId(columns[1]);
    const locked = gridViewColumnId(columns[2]);

    act(() => result.current.moveColumn(first, name));
    expect(result.current.columnOrder.slice(0, 2)).toEqual([name, first]);
    act(() => result.current.moveByKeyboard(name, 1));
    expect(result.current.columnOrder.slice(0, 2)).toEqual([first, name]);
    act(() => result.current.moveColumn(first, locked));
    expect(result.current.columnOrder).toEqual([first, name, locked, gridViewColumnId(columns[3])]);
  });

  it('prevents hiding protected columns and the last visible column', async () => {
    mockApiFetch.mockResolvedValue(response(null, 204));
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns: [columns[0]], data: [], enabled: true }));
    await settleLoad(result);
    const onlyId = gridViewColumnId(columns[0]);
    act(() => result.current.setVisibility(onlyId, false));
    expect(result.current.columnVisibility[onlyId]).not.toBe(false);
  });

  it('does not report save success on HTTP or response-contract failures', async () => {
    mockApiFetch.mockResolvedValue(response(null, 204));
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns, data: [], enabled: true }));
    await settleLoad(result);
    act(() => result.current.resizeBy(gridViewColumnId(columns[0]), 20));
    mockApiFetch.mockResolvedValueOnce(response({ error: 'no' }, 500));

    await act(async () => { expect(await result.current.save()).toBe(false); });
    expect(result.current.saveState).toBe('error');
    expect(result.current.dirty).toBe(true);

    mockApiFetch.mockResolvedValueOnce(response({ version: 99, surface: 'other', columns: [] }));
    await act(async () => { expect(await result.current.save()).toBe(false); });
    expect(result.current.saveState).toBe('error');
    expect(result.current.dirty).toBe(true);
  });
  it('saves and restores a column held at its minimum width without resetting it from the server response', async () => {
    mockApiFetch.mockImplementation((url, options) => {
      if (options?.method === 'PUT') return Promise.resolve(response(JSON.parse(options.body)));
      return Promise.resolve(response(null, 204));
    });
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns, data: [], enabled: true }));
    await settleLoad(result);
    const nameId = gridViewColumnId(columns[1]);

    act(() => result.current.resizeBy(nameId, -1000));
    expect(result.current.columnSizing[nameId]).toBe(48);
    await act(async () => { expect(await result.current.save()).toBe(true); });

    expect(JSON.parse(mockApiFetch.mock.calls[1][1].body).columns.find((column) => column.id === nameId).width).toBe(48);
    expect(result.current.columnSizing[nameId]).toBe(48);
    expect(result.current.dirty).toBe(false);
  });

  it('keeps edits made during an in-flight save dirty after the accepted response', async () => {
    mockApiFetch.mockResolvedValue(response(null, 204));
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns, data: [], enabled: true }));
    await settleLoad(result);
    const nameId = gridViewColumnId(columns[1]);
    act(() => result.current.resizeBy(nameId, 20));
    let resolveSave;
    mockApiFetch.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    let savePromise;
    act(() => { savePromise = result.current.save(); });
    act(() => result.current.resizeBy(nameId, 20));
    await act(async () => {
      resolveSave(response(null, 204));
      await savePromise;
    });

    expect(result.current.saveState).toBe('saved');
    expect(result.current.dirty).toBe(true);
  });

  it('stays inactive and performs no persistence request when the feature is off', () => {
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns, data: [], enabled: false }));
    expect(result.current.active).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('keeps customization and saving inactive until the initial view load settles', async () => {
    let resolveLoad;
    mockApiFetch.mockImplementation((url, options) => {
      if (options?.method === 'PUT') return Promise.resolve(response(null, 204));
      return new Promise((resolve) => { resolveLoad = resolve; });
    });
    const { result } = renderHook(() => useGridView({ spec: 'sales-order', entity: 'header', columns, data: [], enabled: true }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    expect(result.current.loading).toBe(true);
    expect(result.current.active).toBe(false);
    await act(async () => { expect(await result.current.save()).toBe(false); });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLoad(response(null, 204));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe(true);
    expect(result.current.columnOrder).toEqual(columns.map(gridViewColumnId));
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
