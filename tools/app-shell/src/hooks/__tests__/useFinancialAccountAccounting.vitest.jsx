import { renderHook, act } from '@testing-library/react';

import { useFinancialAccountAccounting } from '../useFinancialAccountAccounting.js';

// ETP-4530 — Tab Contabilidad. This hook is a thin fetch/save wrapper around the
// `accountingConfiguration` entity (fully intercepted server-side by
// FinancialAccountAccountingHandler). It is only exercised indirectly (mocked away) in
// EditAccountModal.vitest.jsx / index.vitest.jsx, so it needs direct coverage of its own
// request shape, response unwrapping, and error mapping.

const ENTITY_URL = '/etendo/sws/neo/financial-account/accountingConfiguration';

function okResponse(rows) {
  return { ok: true, json: async () => ({ response: { data: rows } }) };
}

function errorResponse(status, message) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  };
}

describe('useFinancialAccountAccounting', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── fetchAccountingConfiguration ─────────────────────────────────────────

  it('fetchAccountingConfiguration GETs the entity with financialAccountId', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse([{ id: 'row-1', fINAssetAcct: 'AST1', fINTransitoryAcct: null }]),
    );

    const { result } = renderHook(() => useFinancialAccountAccounting());

    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${ENTITY_URL}?financialAccountId=acc-1`);
    expect(init.method).toBeUndefined(); // GET: no explicit method
    // Auth/Content-Type are now supplied by useApiFetch: no ambient session in this
    // test means no Authorization header, and a GET (no body) correctly gets no
    // Content-Type either — unlike the old `authHeaders` alias this hook used to call,
    // which always added one (ETP-5022).
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(row).toEqual({ id: 'row-1', fINAssetAcct: 'AST1', fINTransitoryAcct: null });
  });

  it('fetchAccountingConfiguration URL-encodes the account id', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.fetchAccountingConfiguration('acc/with space');
    });

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${ENTITY_URL}?financialAccountId=acc%2Fwith%20space`);
  });

  it('fetchAccountingConfiguration returns the first record of the response.data envelope', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse([{ id: 'row-1', fINAssetAcct: 'AST1' }, { id: 'row-2', fINAssetAcct: 'AST2' }]),
    );

    const { result } = renderHook(() => useFinancialAccountAccounting());
    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });
    expect(row).toEqual({ id: 'row-1', fINAssetAcct: 'AST1' });
  });

  it('fetchAccountingConfiguration unwraps a non-array data envelope (single object)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ id: 'row-1', fINAssetAcct: 'AST1' }));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });
    expect(row).toEqual({ id: 'row-1', fINAssetAcct: 'AST1' });
  });

  it('fetchAccountingConfiguration returns null when the envelope has no data', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useFinancialAccountAccounting());
    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });
    expect(row).toBeNull();
  });

  it('fetchAccountingConfiguration returns null when the data array is empty', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });
    expect(row).toBeNull();
  });

  it('fetchAccountingConfiguration throws an Error with .status on a non-ok response', async () => {
    globalThis.fetch.mockResolvedValue(errorResponse(404, 'no ledger'));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await expect(
        result.current.fetchAccountingConfiguration('acc-1'),
      ).rejects.toMatchObject({ message: 'no ledger', status: 404 });
    });
  });

  it('fetchAccountingConfiguration falls back to "HTTP <status>" when the error body is unparseable', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await expect(
        result.current.fetchAccountingConfiguration('acc-1'),
      ).rejects.toMatchObject({ message: 'HTTP 500', status: 500 });
    });
  });

  it('fetchAccountingConfiguration stays pending until the underlying fetch settles (loading semantics)', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const { result } = renderHook(() => useFinancialAccountAccounting());

    let resolved = false;
    let capturedRow;
    const promise = result.current.fetchAccountingConfiguration('acc-1').then((row) => {
      resolved = true;
      capturedRow = row;
    });

    // Flush microtasks — the fetch promise has not settled yet, so the hook's
    // promise (what a caller would gate a `loading` flag on) must still be pending.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    await act(async () => {
      resolveFetch(okResponse([{ id: 'row-1', fINAssetAcct: 'AST1' }]));
      await promise;
    });

    expect(resolved).toBe(true);
    expect(capturedRow).toEqual({ id: 'row-1', fINAssetAcct: 'AST1' });
  });

  // ── saveAccountingConfiguration ──────────────────────────────────────────

  // ETP-4872 — the old two-field (fINAssetAcct/fINTransitoryAcct) body is fully retired; the
  // save payload now always carries the 9 account-type-dependent fields, `|| null` each.
  const NINE_FIELDS = {
    fINBankrevaluationgainAcct: 'GAIN1',
    fINBankrevaluationlossAcct: 'LOSS1',
    fINBankfeeAcct: 'FEE1',
    inTransitPaymentAccountIN: 'INTRANSITIN1',
    depositAccount: 'DEP1',
    clearedPaymentAccount: 'CLEAREDIN1',
    fINOutIntransitAcct: 'INTRANSITOUT1',
    withdrawalAccount: 'WITHDRAW1',
    clearedPaymentAccountOUT: 'CLEAREDOUT1',
  };

  it('saveAccountingConfiguration POSTs all 9 fields with the DAL field names (ETP-4872)', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse([{ id: 'row-1', ...NINE_FIELDS }]),
    );

    const { result } = renderHook(() => useFinancialAccountAccounting());

    let saved;
    await act(async () => {
      saved = await result.current.saveAccountingConfiguration('acc-1', NINE_FIELDS);
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(ENTITY_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      financialAccountId: 'acc-1',
      ...NINE_FIELDS,
    });
    expect(saved).toEqual({ id: 'row-1', ...NINE_FIELDS });
  });

  it('saveAccountingConfiguration coerces a falsy value on any of the 9 fields to null (no field required)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.saveAccountingConfiguration('acc-1', {
        ...NINE_FIELDS,
        depositAccount: '',
        withdrawalAccount: null,
      });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      financialAccountId: 'acc-1',
      depositAccount: null,
      withdrawalAccount: null,
    });
  });

  it('saveAccountingConfiguration sends null for every field when the payload is fully empty (no field required)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.saveAccountingConfiguration('acc-1', {});
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      financialAccountId: 'acc-1',
      fINBankrevaluationgainAcct: null,
      fINBankrevaluationlossAcct: null,
      fINBankfeeAcct: null,
      inTransitPaymentAccountIN: null,
      depositAccount: null,
      clearedPaymentAccount: null,
      fINOutIntransitAcct: null,
      withdrawalAccount: null,
      clearedPaymentAccountOUT: null,
    });
  });

  it('saveAccountingConfiguration throws an Error with .status on a non-ok response', async () => {
    globalThis.fetch.mockResolvedValue(errorResponse(400, 'invalid account'));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await expect(
        result.current.saveAccountingConfiguration('acc-1', NINE_FIELDS),
      ).rejects.toMatchObject({ message: 'invalid account', status: 400 });
    });
  });

  it('saveAccountingConfiguration falls back to "HTTP <status>" when the error body is unparseable', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await expect(
        result.current.saveAccountingConfiguration('acc-1', NINE_FIELDS),
      ).rejects.toMatchObject({ message: 'HTTP 500', status: 500 });
    });
  });
});
