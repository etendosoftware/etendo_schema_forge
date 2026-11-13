// @covers artifacts/remittance/custom/sepaFileDataApi.js
//
// «Datos para el fichero SEPA»: the read action behind RemittanceSepaFileData and the IBAN save on
// the financial account. `apiFetch` is the injected boundary (docs/request-policy.md); the save's
// refusal goes through the real throwHttpError.
import {
  NEW_RECORD_SEGMENT,
  fetchSepaFileData,
  normalizeSepaFileData,
  saveAccountIban,
} from '@generated/remittance/custom/sepaFileDataApi.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function brokenJsonResponse({ ok = false, status = 500 } = {}) {
  return { ok, status, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } };
}

const bodyOf = (apiFetch, call = 0) => JSON.parse(apiFetch.mock.calls[call][1].body);

const FULL = {
  accountId: 'acc-1', accountName: 'Santander', iban: 'ES9121000418450200051332', ibanValid: true,
  organizationId: 'org-1', country: 'ES', creditorId: 'ES12000B12345678', creditorIdAvailable: true, missing: [],
};

describe('normalizeSepaFileData', () => {
  it('defaults every key for an empty or missing payload', () => {
    const empty = {
      accountId: null, accountName: '', organizationId: null, iban: null, ibanValid: false,
      country: null, creditorId: null, creditorIdAvailable: false, missing: [],
    };
    expect(normalizeSepaFileData(undefined)).toEqual(empty);
    expect(normalizeSepaFileData(null)).toEqual(empty);
    expect(normalizeSepaFileData({})).toEqual(empty);
  });

  it('keeps a complete payload as is', () => {
    expect(normalizeSepaFileData(FULL)).toEqual(FULL);
  });

  it('turns an empty IBAN or creditor id into null', () => {
    const out = normalizeSepaFileData({ iban: '', creditorId: '', creditorIdAvailable: true });
    expect(out.iban).toBeNull();
    expect(out.creditorId).toBeNull();
    // Available only with an actual id.
    expect(out.creditorIdAvailable).toBe(false);
  });

  it('accepts only a real boolean true for the two flags', () => {
    const out = normalizeSepaFileData({ ibanValid: 'true', creditorIdAvailable: 'Y', creditorId: 'X' });
    expect(out.ibanValid).toBe(false);
    expect(out.creditorIdAvailable).toBe(false);
  });

  it('defaults a non-array `missing` to an empty list, and keeps its order otherwise', () => {
    expect(normalizeSepaFileData({ missing: 'iban' }).missing).toEqual([]);
    expect(normalizeSepaFileData({ missing: ['iban', 'orgTaxId', 'country'] }).missing).toEqual(['iban', 'orgTaxId', 'country']);
  });
});

describe('fetchSepaFileData', () => {
  it('posts to the `new` record segment for an unsaved remittance', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: FULL } }));
    await fetchSepaFileData(apiFetch, null, 'acc-1');
    expect(NEW_RECORD_SEGMENT).toBe('new');
    expect(apiFetch).toHaveBeenCalledWith('/remittance/new/action/sepaFileData', expect.objectContaining({ method: 'POST' }));
    await fetchSepaFileData(apiFetch, undefined, 'acc-1');
    expect(apiFetch.mock.calls[1][0]).toBe('/remittance/new/action/sepaFileData');
  });

  it('encodes the id of a saved remittance', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: FULL } }));
    await fetchSepaFileData(apiFetch, 'rem/1 a', 'acc-1');
    expect(apiFetch.mock.calls[0][0]).toBe('/remittance/rem%2F1%20a/action/sepaFileData');
  });

  it('sends the account, and the organization only when known', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: FULL } }));
    await fetchSepaFileData(apiFetch, 'rem-1', 'acc-1');
    await fetchSepaFileData(apiFetch, 'rem-1', 'acc-1', 'org-9');
    expect(bodyOf(apiFetch, 0)).toEqual({ accountId: 'acc-1' });
    expect(bodyOf(apiFetch, 1)).toEqual({ accountId: 'acc-1', organizationId: 'org-9' });
  });

  it('returns the normalized model from either envelope', async () => {
    const wrapped = vi.fn().mockResolvedValue(jsonResponse({ response: { data: { accountId: 'acc-1', missing: ['iban'] } } }));
    const plain = vi.fn().mockResolvedValue(jsonResponse({ data: { accountId: 'acc-2' } }));
    expect(await fetchSepaFileData(wrapped, 'rem-1', 'acc-1')).toMatchObject({ accountId: 'acc-1', iban: null, missing: ['iban'] });
    expect(await fetchSepaFileData(plain, 'rem-1', 'acc-2')).toMatchObject({ accountId: 'acc-2', ibanValid: false, missing: [] });
  });

  it('throws with status and body on a refusal', async () => {
    const body = { error: { message: 'not a bank', messageKeys: ['ETGO_RemittanceAccountNotBank'] } };
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(body, { ok: false, status: 422 }));
    await expect(fetchSepaFileData(apiFetch, 'rem-1', 'acc-1')).rejects.toMatchObject({ status: 422, body, message: 'not a bank' });
  });

  it('throws with a null body when the refusal has no JSON (e.g. a plain-text 404)', async () => {
    const apiFetch = vi.fn().mockResolvedValue(brokenJsonResponse({ status: 404 }));
    await expect(fetchSepaFileData(apiFetch, 'rem-1', 'acc-1')).rejects.toMatchObject({ status: 404, body: null, message: 'sepaFileData 404' });
  });
});

describe('saveAccountIban', () => {
  const URL_ = '/sws/neo/financial-account/account/acc%2F1';

  function accountsFetch({ read = jsonResponse({ response: { data: [{ id: 'acc/1', updated: '2026-11-12T10:00:00Z' }] } }), write = jsonResponse({ response: { data: [{ id: 'acc/1' }] } }) } = {}) {
    return vi.fn((url, init) => Promise.resolve(init?.method === 'PATCH' ? write : read));
  }

  it('reads the account for its `updated` token, then PATCHes the IBAN with it', async () => {
    const apiFetch = accountsFetch();
    await saveAccountIban(apiFetch, 'acc/1', 'ES9121000418450200051332');
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch.mock.calls[0]).toEqual([URL_]);
    expect(apiFetch.mock.calls[1][0]).toBe(URL_);
    expect(apiFetch.mock.calls[1][1].method).toBe('PATCH');
    expect(bodyOf(apiFetch, 1)).toEqual({ iBAN: 'ES9121000418450200051332', updated: '2026-11-12T10:00:00Z' });
  });

  it('reads `updated` from a single-object envelope too', async () => {
    const apiFetch = accountsFetch({ read: jsonResponse({ response: { data: { id: 'acc/1', updated: 'T2' } } }) });
    await saveAccountIban(apiFetch, 'acc/1', 'ES9121000418450200051332');
    expect(bodyOf(apiFetch, 1).updated).toBe('T2');
  });

  it('never sends a `country` key, even when the read record carries one', async () => {
    const apiFetch = accountsFetch({ read: jsonResponse({ response: { data: [{ id: 'acc/1', updated: 'T', country: null }] } }) });
    await saveAccountIban(apiFetch, 'acc/1', 'ES9121000418450200051332');
    expect(Object.keys(bodyOf(apiFetch, 1)).sort()).toEqual(['iBAN', 'updated']);
  });

  it('does not PATCH when the read fails, and throws with status and body', async () => {
    const body = { error: { message: 'Account not found' } };
    const apiFetch = accountsFetch({ read: jsonResponse(body, { ok: false, status: 404 }) });
    await expect(saveAccountIban(apiFetch, 'acc/1', 'ES91')).rejects.toMatchObject({ status: 404, body });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('throws a refusal in the throwHttpError shape (message, status, code, body)', async () => {
    const body = { error: { status: 400, message: 'Se necesita el País para una cuenta IBAN.', messageKeys: ['ETGO_FinAccIbanRequiresCountry'] } };
    const apiFetch = accountsFetch({ write: jsonResponse(body, { ok: false, status: 400 }) });
    const err = await saveAccountIban(apiFetch, 'acc/1', 'XX00').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ status: 400, code: null, body, message: 'Se necesita el País para una cuenta IBAN.' });
  });
});
