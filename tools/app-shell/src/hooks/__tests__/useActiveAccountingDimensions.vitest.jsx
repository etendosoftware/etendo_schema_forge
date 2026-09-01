/**
 * useActiveAccountingDimensions (ETP-4950).
 *
 * The hook's whole contract is "tell me the active dimensions, or `null` when you do not know" —
 * `null` being what every consumer reads as "do not filter anything". So the failure paths (!ok,
 * thrown request, malformed envelope) matter as much as the happy one: each must resolve to `null`,
 * never to `[]`, which would hide every dimension field.
 */
import { renderHook, waitFor } from '@testing-library/react';

const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (baseUrl) => {
    apiFetchMock.baseUrl = baseUrl;
    return apiFetchMock;
  },
}));

import { useActiveAccountingDimensions } from '../useActiveAccountingDimensions.js';

const ENTITY = 'etgoMatchRuleHeader';
const API_BASE = 'http://neo.test/sws/neo/match-rule';

/** A Response-like object carrying the NEO envelope. */
function jsonResponse(body, { ok = true } = {}) {
  return { ok, json: () => Promise.resolve(body) };
}

function renderDimensions(opts = {}) {
  return renderHook(() => useActiveAccountingDimensions(ENTITY, { apiBaseUrl: API_BASE, ...opts }));
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('useActiveAccountingDimensions — happy path', () => {
  it('returns the dimensions from the response.data.dimensions envelope', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({ response: { data: { dimensions: ['project', 'product'] } } }),
    );
    const { result } = renderDimensions();

    await waitFor(() => expect(result.current).toEqual(['project', 'product']));
  });

  it('starts as null before the request resolves (fail open while unknown)', () => {
    apiFetchMock.mockReturnValue(new Promise(() => {})); // never settles
    const { result } = renderDimensions();

    expect(result.current).toBeNull();
  });

  it('requests {entity}?action=activeDimensions through the spec-scoped apiFetch', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: { dimensions: [] } } }));
    renderDimensions();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith(`/${ENTITY}?action=activeDimensions`);
    expect(apiFetchMock.baseUrl).toBe(API_BASE);
  });

  it('returns an empty list verbatim (a tenant with every dimension switched off)', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: { dimensions: [] } } }));
    const { result } = renderDimensions();

    await waitFor(() => expect(result.current).toEqual([]));
  });
});

describe('useActiveAccountingDimensions — fail open', () => {
  it('stays null when the response is not ok', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({ response: { data: { dimensions: ['project'] } } }, { ok: false }),
    );
    const { result } = renderDimensions();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });

  it('stays null when the request throws', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderDimensions();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });

  it('stays null when the body cannot be parsed as JSON', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: () => Promise.reject(new Error('not json')) });
    const { result } = renderDimensions();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });

  it('stays null when the envelope carries no dimensions array', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: {} } }));
    const { result } = renderDimensions();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });

  it('stays null when dimensions is not an array', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({ response: { data: { dimensions: 'project' } } }),
    );
    const { result } = renderDimensions();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });
});

describe('useActiveAccountingDimensions — enabled / entity guards', () => {
  it('makes no request and returns null when enabled is false', async () => {
    const { result } = renderDimensions({ enabled: false });

    await waitFor(() => expect(result.current).toBeNull());
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('makes no request when no entity is given', async () => {
    const { result } = renderHook(
      () => useActiveAccountingDimensions(null, { apiBaseUrl: API_BASE }),
    );

    await waitFor(() => expect(result.current).toBeNull());
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('works with no options object at all', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: { dimensions: ['product'] } } }));
    const { result } = renderHook(() => useActiveAccountingDimensions(ENTITY));

    await waitFor(() => expect(result.current).toEqual(['product']));
  });

  it('drops a resolved answer back to null when gating is switched off', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: { dimensions: ['product'] } } }));
    const { result, rerender } = renderHook(
      ({ enabled }) => useActiveAccountingDimensions(ENTITY, { apiBaseUrl: API_BASE, enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current).toEqual(['product']));

    rerender({ enabled: false });
    expect(result.current).toBeNull();
  });

  it('re-requests when the entity changes', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: { dimensions: ['project'] } } }));
    const { rerender } = renderHook(
      ({ entity }) => useActiveAccountingDimensions(entity, { apiBaseUrl: API_BASE }),
      { initialProps: { entity: ENTITY } },
    );
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));

    rerender({ entity: 'other' });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(apiFetchMock).toHaveBeenLastCalledWith('/other?action=activeDimensions');
  });
});
