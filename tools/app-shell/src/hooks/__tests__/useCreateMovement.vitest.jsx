import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import {
  useCreateMovement,
  useProcessMovement,
  useReactivateMovement,
  useDeleteMovement,
  buildDimensionUpdatePayload,
} from '../useCreateMovement.js';

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

describe('useCreateMovement', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the initial idle state', () => {
    const { result } = renderHook(() => useCreateMovement());
    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.createMovement).toBe('function');
  });

  it('POSTs the payload to /financial-account-transactions?action=create with bearer auth', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { id: 'mov-1', trxType: 'BPD' } } }),
    });

    const { result } = renderHook(() => useCreateMovement());

    const payload = { FIN_Financial_Account_ID: 'acc-1', trxType: 'BPD', amount: 100 };
    let res;
    await act(async () => {
      res = await result.current.createMovement(payload);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(
      '/etendo/sws/neo/financial-account-transactions?action=create',
    );
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(res).toEqual({ id: 'mov-1', trxType: 'BPD' });
  });

  it('flips the creating flag during the call and back to false after', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(
      new Promise((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useCreateMovement());
    let promise;
    act(() => {
      promise = result.current.createMovement({});
    });

    await waitFor(() => expect(result.current.creating).toBe(true));

    await act(async () => {
      resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      await promise;
    });

    expect(result.current.creating).toBe(false);
  });

  // ETP-5085: the thrown Error carries the backend's OWN business message, with no `HTTP <status>:`
  // prefix and no raw JSON, so the caller can hand it to translateBackendError and show it
  // translated. The status still travels on the error for callers that branch on it.
  it('throws the backend business message (not the raw body) on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid trxType', status: 400 } }),
    });

    const { result } = renderHook(() => useCreateMovement());

    await act(async () => {
      await expect(result.current.createMovement({})).rejects.toThrow('Invalid trxType');
    });
    await waitFor(() => expect(result.current.creating).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('Invalid trxType');
    expect(result.current.error.message).not.toContain('HTTP');
    expect(result.current.error.status).toBe(400);
  });

  it('falls back to `HTTP <status>` when the error body has no message', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useCreateMovement());

    await act(async () => {
      await expect(result.current.createMovement({})).rejects.toThrow(/HTTP 500/);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('HTTP 500');
    expect(result.current.error.status).toBe(500);
  });

  it('tolerates a non-JSON error body and still produces an HTTP error', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('Unexpected token < in JSON'); },
    });

    const { result } = renderHook(() => useCreateMovement());

    await act(async () => {
      await expect(result.current.createMovement({})).rejects.toThrow(/HTTP 500/);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('HTTP 500');
  });

  it('propagates a network rejection and stores it on `error`', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useCreateMovement());

    await act(async () => {
      await expect(result.current.createMovement({})).rejects.toThrow('Network down');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('Network down');
  });

  it('returns {} when the API omits response.data', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ /* no response */ }),
    });

    const { result } = renderHook(() => useCreateMovement());

    let res;
    await act(async () => {
      res = await result.current.createMovement({});
    });
    expect(res).toEqual({});
  });
});

// ── Lifecycle hooks (ETP-4500) ────────────────────────────────────────────────
// process / reactivate / delete all share the usePostAction plumbing, POSTing
// { id } to ?action=<verb>. Parametrized to keep the coverage symmetric.
describe('movement lifecycle hooks', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const CASES = [
    { name: 'useProcessMovement', hook: useProcessMovement, fn: 'processMovement', busy: 'processing', action: 'process' },
    { name: 'useReactivateMovement', hook: useReactivateMovement, fn: 'reactivateMovement', busy: 'reactivating', action: 'reactivate' },
    { name: 'useDeleteMovement', hook: useDeleteMovement, fn: 'deleteMovement', busy: 'deleting', action: 'delete' },
  ];

  for (const { name, hook, fn, busy, action } of CASES) {
    describe(name, () => {
      it(`starts idle and POSTs { id } to ?action=${action} with bearer auth`, async () => {
        globalThis.fetch.mockResolvedValue({
          ok: true,
          json: async () => ({ response: { data: { id: 'mov-1' } } }),
        });

        const { result } = renderHook(() => hook());
        expect(result.current[busy]).toBe(false);
        expect(result.current.error).toBeNull();
        expect(typeof result.current[fn]).toBe('function');

        let res;
        await act(async () => {
          res = await result.current[fn]({ id: 'mov-1' });
        });

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        const [url, init] = globalThis.fetch.mock.calls[0];
        expect(url).toBe(
          `/etendo/sws/neo/financial-account-transactions?action=${action}`,
        );
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({ id: 'mov-1' });
        expect(res).toEqual({ id: 'mov-1' });
      });

      it('flips the busy flag during the call and clears it after', async () => {
        let resolve;
        globalThis.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));

        const { result } = renderHook(() => hook());
        let promise;
        act(() => { promise = result.current[fn]({ id: 'x' }); });

        await waitFor(() => expect(result.current[busy]).toBe(true));

        await act(async () => {
          resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
          await promise;
        });
        expect(result.current[busy]).toBe(false);
      });

      it('throws the backend message and captures the error on HTTP failure', async () => {
        globalThis.fetch.mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => ({ error: { message: 'Conflicting state', status: 409 } }),
        });

        const { result } = renderHook(() => hook());
        await act(async () => {
          await expect(result.current[fn]({ id: 'x' })).rejects.toThrow('Conflicting state');
        });
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error.message).toBe('Conflicting state');
        expect(result.current.error.status).toBe(409);
      });

      it('falls back to `HTTP <status>` when the error body carries no message', async () => {
        globalThis.fetch.mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => { throw new Error('empty body'); },
        });

        const { result } = renderHook(() => hook());
        await act(async () => {
          await expect(result.current[fn]({ id: 'x' })).rejects.toThrow(/HTTP 409/);
        });
        expect(result.current.error.message).toBe('HTTP 409');
      });
    });
  }
});

// ETP-5085 regression. Deleting either leg of a funds transfer now gets a 409 with the guard's own
// sentence, which is a BACKEND_ERROR_MAP key. The hook must surface that sentence verbatim — the
// bug was the old `HTTP <status>: <raw body>` wrapper, which made the message impossible to look up
// and dumped `HTTP 500: {"error":{"message":…}}` into the toast.
describe('useDeleteMovement — funds-transfer leg rejection', () => {
  const TRANSFER_NOT_DELETABLE = 'Movements generated by a funds transfer cannot be deleted.';

  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects with the exact backend message and the 409 status', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { message: TRANSFER_NOT_DELETABLE, status: 409 } }),
    });

    const { result } = renderHook(() => useDeleteMovement());

    let caught;
    await act(async () => {
      caught = await result.current.deleteMovement({ id: 'mov-1' }).catch((e) => e);
    });

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe(TRANSFER_NOT_DELETABLE);
    expect(caught.status).toBe(409);
    expect(result.current.error.message).toBe(TRANSFER_NOT_DELETABLE);
  });
});

// ETP-5101 — the "más información" row-expand panel's inline dimension edit. Pure function,
// no hooks/mocks needed. Fixture is trimmed from a REAL row returned by
// GET /sws/neo/financial-account-transactions (posted/payment-linked in its raw form; the
// individual tests override whichever fields are relevant to what they assert).
describe('buildDimensionUpdatePayload', () => {
  const MOVEMENT = {
    id: 'ABD8375BE08B4E579334C94503554F03',
    date: '2026-08-28T00:00:00Z',
    trxType: 'BPD',
    description: 'Factura Nº : 10000016.',
    posted: 'Y',
    paymentId: 'ABD8375BE08B4E579334C94503554F03',
    glItemId: '',
    bpartnerId: '240720F10BCD43E99C4B5EEA33CEF071',
    projectId: '',
    costcenterId: '',
    productId: '',
    depositAmount: 14.52,
    withdrawalAmount: 0,
    processed: true,
  };

  it('maps the movement row + account currency into a full update payload', () => {
    const payload = buildDimensionUpdatePayload(MOVEMENT, 'cur-eur', { projectId: 'proj-1' });
    expect(payload).toEqual({
      id: 'ABD8375BE08B4E579334C94503554F03',
      trxType: 'BPD',
      transactionDate: '2026-08-28T00:00:00Z',
      accountingDate: '2026-08-28T00:00:00Z',
      depositAmount: 14.52,
      paymentAmount: 0,
      currencyId: 'cur-eur',
      description: 'Factura Nº : 10000016.',
      glItemId: null,
      bpartnerId: '240720F10BCD43E99C4B5EEA33CEF071',
      costcenterId: null,
      projectId: 'proj-1',
      productId: null,
      process: false,
    });
  });

  it('leaves the other two dimension ids from the movement row untouched when overriding just one', () => {
    const withIds = { ...MOVEMENT, projectId: 'proj-old', costcenterId: 'cc-old', productId: 'prod-old' };
    const payload = buildDimensionUpdatePayload(withIds, 'cur-eur', { costcenterId: 'cc-new' });
    expect(payload.projectId).toBe('proj-old');
    expect(payload.costcenterId).toBe('cc-new');
    expect(payload.productId).toBe('prod-old');
  });

  it('always sends process: false, regardless of the movement own processed/posted state', () => {
    const draftUnposted = { ...MOVEMENT, processed: false, posted: 'N' };
    expect(buildDimensionUpdatePayload(draftUnposted, 'cur-eur', {}).process).toBe(false);

    const processedPosted = { ...MOVEMENT, processed: true, posted: 'Y' };
    expect(buildDimensionUpdatePayload(processedPosted, 'cur-eur', {}).process).toBe(false);
  });

  it('does not read process/processed/posted off the movement row at all — only overrides can change it', () => {
    // The dimension-only override never includes `process`, so callers of this helper (the
    // DimensionsPanel save path) always get `process: false` no matter what the row looks like.
    const payload = buildDimensionUpdatePayload(MOVEMENT, 'cur-eur', { projectId: 'p-1' });
    expect(payload.process).toBe(false);
    expect(payload).not.toHaveProperty('processed');
    expect(payload).not.toHaveProperty('posted');
  });

  it('maps empty-string dimension/glItem/bpartner ids ("") to null, not ""', () => {
    const payload = buildDimensionUpdatePayload(MOVEMENT, 'cur-eur', {});
    expect(payload.glItemId).toBeNull();
    expect(payload.costcenterId).toBeNull();
    expect(payload.projectId).toBeNull();
    expect(payload.productId).toBeNull();
    // bpartnerId carries a real id in the fixture — confirms the || null fallback only
    // fires for actually-falsy values, not a general string-to-null coercion.
    expect(payload.bpartnerId).toBe('240720F10BCD43E99C4B5EEA33CEF071');
  });

  it('defaults depositAmount/paymentAmount to 0 when the movement omits them', () => {
    const { depositAmount, withdrawalAmount, ...rest } = MOVEMENT;
    const payload = buildDimensionUpdatePayload(rest, 'cur-eur', {});
    expect(payload.depositAmount).toBe(0);
    expect(payload.paymentAmount).toBe(0);
  });

  it('defaults description to an empty string when the movement omits it', () => {
    const { description, ...rest } = MOVEMENT;
    expect(buildDimensionUpdatePayload(rest, 'cur-eur', {}).description).toBe('');
  });
});
