// ETP-5027 — `validate349Vies`: POST /neo/fiscal349/validate-vies?year=&period=
// → 200 { validated, valid, invalid, notEligible, failed, stillPending }.
//
// Every call here is against a stubbed `fetch`. Nothing in this suite may reach
// ec.europa.eu or a real NEO instance.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { validate349Vies } from '../../../fiscalModelsUtils.js';

const DECL = { id: '349-2026-T1', year: 2026, period: 'T1' };
const API = 'https://host/sws/neo/fiscal-models';

function stubJson(payload, { ok = true, status = 200 } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('validate349Vies — request', () => {
  it('POSTs to /fiscal349/validate-vies with the declaration period and the bearer token', async () => {
    const fetchMock = stubJson({ validated: 0, valid: 0, invalid: 0, stillPending: 0 });

    await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // The `/fiscal-models` segment is stripped the same way compute349Operators does it.
    expect(url).toBe('https://host/sws/neo/fiscal349/validate-vies?year=2026&period=T1');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('does not call the network at all without a token or apiBaseUrl', async () => {
    const fetchMock = stubJson({ validated: 1 });

    expect(await validate349Vies(DECL, {})).toEqual({ ok: false, error: 'no_token' });
    expect(await validate349Vies(DECL, { token: 'tok' })).toEqual({ ok: false, error: 'no_token' });
    expect(await validate349Vies(DECL, { apiBaseUrl: API })).toEqual({ ok: false, error: 'no_token' });
    expect(await validate349Vies(DECL)).toEqual({ ok: false, error: 'no_token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('validate349Vies — success payload', () => {
  it('returns the six counts on 200', async () => {
    stubJson({ validated: 6, valid: 3, invalid: 1, notEligible: 1, failed: 1, stillPending: 0 });
    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API })).toEqual({
      ok: true, validated: 6, valid: 3, invalid: 1, notEligible: 1, failed: 1, stillPending: 0,
    });
  });

  it('coerces the NEO string-number shape', async () => {
    stubJson({
      validated: '6', valid: '2', invalid: '1', notEligible: '1', failed: '1', stillPending: '1',
    });
    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API })).toEqual({
      ok: true, validated: 6, valid: 2, invalid: 1, notEligible: 1, failed: 1, stillPending: 1,
    });
  });

  it('defaults missing / non-numeric / negative counts to 0 rather than NaN', async () => {
    stubJson({ validated: 2, valid: 'abc', notEligible: 'x', failed: null, stillPending: -3 });
    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API })).toEqual({
      ok: true, validated: 2, valid: 0, invalid: 0, notEligible: 0, failed: 0, stillPending: 0,
    });
  });

  // ETP-5027 (QA F2/F5): `notEligible` and `failed` were split out of `stillPending`. A
  // payload from a backend that predates the split must still parse — both simply read 0.
  it('tolerates a legacy four-count payload', async () => {
    stubJson({ validated: 4, valid: 3, invalid: 1, stillPending: 0 });
    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API })).toEqual({
      ok: true, validated: 4, valid: 3, invalid: 1, notEligible: 0, failed: 0, stillPending: 0,
    });
  });

  it('survives an empty body without throwing', async () => {
    stubJson(null);
    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API })).toEqual({
      ok: true, validated: 0, valid: 0, invalid: 0, notEligible: 0, failed: 0, stillPending: 0,
    });
  });
});

describe('validate349Vies — failures', () => {
  it('surfaces the backend message through parseServerMessage on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({
        error: { message: 'org.openbravo.base.OBException: @AEAT349_ViesUnavailable@' },
      }),
    }));

    // Same contract as generate349File: the Java exception prefix is stripped and the
    // Openbravo message key loses its @ delimiters, so the caller can toast it directly.
    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API })).toEqual({
      ok: false,
      error: 'http_500',
      serverMessage: 'AEAT349_ViesUnavailable',
    });
  });

  it('reports http_<status> with no serverMessage when the body is not parseable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '<html>Forbidden</html>',
    }));

    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API })).toEqual({
      ok: false,
      error: 'http_403',
      serverMessage: undefined,
    });
  });

  it('reports a network error rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API }))
      .toEqual({ ok: false, error: 'network' });
  });

  it('reports a network error when the 200 body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    }));
    expect(await validate349Vies(DECL, { token: 'tok', apiBaseUrl: API }))
      .toEqual({ ok: false, error: 'network' });
  });
});
