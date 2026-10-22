// @covers tools/app-shell/src/windows/custom/organization/useRepresentantesLegales.js
// @covers tools/app-shell/src/windows/custom/organization/representanteLegal.js
//
// The legal representatives data hook of the Organization window (Modelo 390). What must hold:
// rows come out in line order (the Modelo 390 reads the first 3 by line), a create never sends
// `lineNo` (the server assigns MAX+10) and carries `parentId`, and the power-of-attorney date
// travels as a plain `yyyy-MM-dd` date-only value.

import { renderHook, act, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

import { useRepresentantesLegales } from '../useRepresentantesLegales.js';
import {
  buildRepresentativePayload,
  getRepresentativeErrors,
  representativeToForm,
  sortByLineNo,
  toCalendarISO,
} from '../representanteLegal.js';

const API_BASE_URL = '/sws/neo/organization';
const ORG_ID = 'org-1';

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body });
}

function rowsResponse(rows) {
  return jsonResponse({ response: { data: rows } });
}

const VALID_FORM = {
  taxID: '12345678Z',
  firstName: 'Ana',
  lastname1: 'García',
  lastname2: '',
  powerDate: '2026-01-15',
  notaryName: 'Notaría Pérez',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useRepresentantesLegales — load', () => {
  it('does not fetch when orgId is falsy', () => {
    globalThis.fetch = vi.fn();
    const { result } = renderHook(() => useRepresentantesLegales(null, API_BASE_URL));
    expect(result.current.rows).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('asks the server for line order, scoped to the org', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(rowsResponse([]));
    const { result } = renderHook(() => useRepresentantesLegales(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain(`/organization/representanteLegal?parentId=${ORG_ID}`);
    expect(url).toContain('_limit=100');
    expect(url).toContain('_sortBy=lineNo');
  });

  it('orders rows by lineNo ascending even when the server returns them unordered', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(rowsResponse([
      { id: 'c', lineNo: 30 },
      { id: 'a', lineNo: 10 },
      { id: 'd', lineNo: 100 },
      { id: 'b', lineNo: 20 },
    ]));
    const { result } = renderHook(() => useRepresentantesLegales(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.rows).toHaveLength(4));

    expect(result.current.rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reports a load error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useRepresentantesLegales(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.rows).toEqual([]);
  });
});

describe('useRepresentantesLegales — writes', () => {
  async function renderLoaded() {
    const hook = renderHook(() => useRepresentantesLegales(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  it('createRow POSTs with parentId and never sends lineNo', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse([]))
      .mockResolvedValueOnce(jsonResponse({ response: { data: [{ id: 'new-1', lineNo: 10 }] } }));
    const { result } = await renderLoaded();

    let created;
    await act(async () => {
      created = await result.current.createRow({ ...buildRepresentativePayload(VALID_FORM), lineNo: 999 });
    });

    expect(created).toEqual({ id: 'new-1', lineNo: 10 });
    const [url, opts] = globalThis.fetch.mock.calls[1];
    expect(url).toMatch(/\/organization\/representanteLegal$/);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body).not.toHaveProperty('lineNo');
    expect(body).toMatchObject({
      parentId: ORG_ID,
      taxID: '12345678Z',
      firstName: 'Ana',
      lastname1: 'García',
      lastname2: null,
      powerDate: '2026-01-15',
      notaryName: 'Notaría Pérez',
    });
  });

  it('updateRow PATCHes the row by id', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse([]))
      .mockResolvedValueOnce(jsonResponse({ response: { data: [{ id: 'r1' }] } }));
    const { result } = await renderLoaded();

    await act(async () => { await result.current.updateRow('r1', { notaryName: 'X' }); });

    const [url, opts] = globalThis.fetch.mock.calls[1];
    expect(url).toMatch(/\/representanteLegal\/r1$/);
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ notaryName: 'X' });
  });

  it('deleteRow DELETEs and surfaces the backend message on failure', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse([]))
      .mockResolvedValueOnce(jsonResponse({ response: { error: { message: 'Nope' } } }, false, 400));
    const { result } = await renderLoaded();

    await expect(result.current.deleteRow('r1')).rejects.toThrow('Nope');
    const [url, opts] = globalThis.fetch.mock.calls[1];
    expect(url).toMatch(/\/representanteLegal\/r1$/);
    expect(opts.method).toBe('DELETE');
  });
});

describe('representanteLegal helpers', () => {
  it('sortByLineNo puts rows without a line last and keeps ties stable', () => {
    const sorted = sortByLineNo([{ id: 'x' }, { id: 'b', lineNo: 20 }, { id: 'a', lineNo: '10' }, { id: 'c', lineNo: 20 }]);
    expect(sorted.map(r => r.id)).toEqual(['a', 'b', 'c', 'x']);
  });

  it('toCalendarISO keeps the calendar day of a date-only or timestamped server value', () => {
    expect(toCalendarISO('2026-01-15')).toBe('2026-01-15');
    expect(toCalendarISO('2026-01-15T00:00:00+01:00')).toBe('2026-01-15');
    expect(toCalendarISO('')).toBe('');
    expect(toCalendarISO(null)).toBe('');
  });

  it('representativeToForm seeds the date as yyyy-MM-dd', () => {
    expect(representativeToForm({ powerDate: '2025-12-31T00:00:00', taxID: 'T' })).toMatchObject({
      powerDate: '2025-12-31',
      taxID: 'T',
      lastname2: '',
    });
  });

  it('getRepresentativeErrors flags every required field except the second surname', () => {
    const errors = getRepresentativeErrors({});
    expect(Object.keys(errors).sort()).toEqual(['firstName', 'lastname1', 'notaryName', 'powerDate', 'taxID']);
    expect(errors.taxID).toEqual({ key: 'fieldRequired' });
  });

  it('getRepresentativeErrors enforces the AD lengths and the NIF format', () => {
    expect(getRepresentativeErrors(VALID_FORM)).toEqual({});
    const tooLong = getRepresentativeErrors({ ...VALID_FORM, notaryName: 'x'.repeat(61) });
    expect(tooLong.notaryName).toEqual({ key: 'fieldMaxLengthError', params: { maxLength: 60 } });
    const badNif = getRepresentativeErrors({ ...VALID_FORM, taxID: '12345678A' });
    expect(badNif.taxID.key).toMatch(/^taxIdInvalid/);
  });
});
