// @covers artifacts/remittance/custom/sepaFileDataApi.js
//
// «Datos para el fichero SEPA»: the read action behind RemittanceSepaFileData (the IBAN is no longer saved
// here: it travels with the header). `apiFetch` is the injected boundary (docs/request-policy.md).
import {
  NEW_RECORD_SEGMENT,
  fetchAccountLogo,
  fetchRemittanceTypeDirection,
  fetchSepaFileData,
  normalizeSepaFileData,
} from '@generated/remittance/custom/sepaFileDataApi.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function brokenJsonResponse({ ok = false, status = 500 } = {}) {
  return { ok, status, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } };
}

const bodyOf = (apiFetch, call = 0) => JSON.parse(apiFetch.mock.calls[call][1].body);

const FULL = {
  remittanceCreditorId: 'ES12000B12345678', remittanceCreditorIdValid: true, accountCreditorId: null, accountCreditorIdValid: null,
  directDebitScheme: 'B2B', financed: true, collection: true, suggestedCreditorId: null, creditorIdSource: 'remittance',
  accountId: 'acc-1', accountName: 'Santander', iban: 'ES9121000418450200051332', ibanValid: true,
  remittanceIban: 'ES9121000418450200051332', remittanceIbanValid: true, accountIban: null, accountIbanValid: null, ibanSource: 'remittance',
  organizationId: 'org-1', country: 'ES', creditorId: 'ES12000B12345678', creditorIdAvailable: true, missing: [],
};

describe('normalizeSepaFileData', () => {
  it('defaults every key for an empty or missing payload', () => {
    const empty = {
      remittanceCreditorId: null, remittanceCreditorIdValid: null, accountCreditorId: null, accountCreditorIdValid: null,
      directDebitScheme: null, financed: false, collection: null, suggestedCreditorId: null, creditorIdSource: 'missing',
      accountId: null, accountName: '', organizationId: null, iban: null, ibanValid: false,
      remittanceIban: null, remittanceIbanValid: null, accountIban: null, accountIbanValid: null, ibanSource: 'missing',
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

describe('normalizeSepaFileData — IBAN of the remittance', () => {
  it('infers the source when the backend omits it, and ignores an unknown one', () => {
    expect(normalizeSepaFileData({ remittanceIban: 'ES91' }).ibanSource).toBe('remittance');
    expect(normalizeSepaFileData({ accountIban: 'ES91' }).ibanSource).toBe('account');
    expect(normalizeSepaFileData({ iban: 'ES91' }).ibanSource).toBe('account');
    expect(normalizeSepaFileData({ ibanSource: 'weird' }).ibanSource).toBe('missing');
    expect(normalizeSepaFileData({ ibanSource: 'account', remittanceIbanValid: 'x' })).toMatchObject({ ibanSource: 'account', remittanceIbanValid: null });
  });
});

describe('normalizeSepaFileData — collection options', () => {
  it('keeps only CORE | B2B as the scheme and a real boolean true as financed', () => {
    expect(normalizeSepaFileData({ directDebitScheme: 'B2B', financed: true })).toMatchObject({ directDebitScheme: 'B2B', financed: true });
    expect(normalizeSepaFileData({ directDebitScheme: 'SCT', financed: 'Y' })).toMatchObject({ directDebitScheme: null, financed: false });
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

describe('fetchRemittanceTypeDirection', () => {
  const items = (list) => vi.fn().mockResolvedValue(jsonResponse({ response: { data: { items: list } } }));

  it('reads the `direction` of the chosen type from the account\'s type selector', async () => {
    const apiFetch = items([{ id: 't1', label: 'A', direction: 'payment' }, { id: 't2', label: 'B', direction: 'collection' }]);
    await expect(fetchRemittanceTypeDirection(apiFetch, 'acc 1', 't2')).resolves.toBe('collection');
    expect(apiFetch).toHaveBeenCalledWith('/remittance/selectors/remittanceType?FIN_Financial_Account_ID=acc%201');
  });

  it('is null when the backend sends no direction, the type is unknown, or the request fails', async () => {
    await expect(fetchRemittanceTypeDirection(items([{ id: 't1', label: 'A' }]), 'a', 't1')).resolves.toBeNull();
    await expect(fetchRemittanceTypeDirection(items([{ id: 't1', direction: 'collection' }]), 'a', 'other')).resolves.toBeNull();
    await expect(fetchRemittanceTypeDirection(items([{ id: 't1', direction: 'weird' }]), 'a', 't1')).resolves.toBeNull();
    await expect(fetchRemittanceTypeDirection(vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })), 'a', 't1')).resolves.toBeNull();
    await expect(fetchRemittanceTypeDirection(vi.fn().mockRejectedValue(new Error('net')), 'a', 't1')).resolves.toBeNull();
  });
});

describe('fetchAccountLogo', () => {
  it('reads the account record\'s providerLogoUrl and type', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: { providerLogoUrl: 'https://cdn/b.svg', type: 'B' } } }));
    await expect(fetchAccountLogo(apiFetch, 'acc 1')).resolves.toEqual({ providerLogoUrl: 'https://cdn/b.svg', type: 'B' });
    expect(apiFetch).toHaveBeenCalledWith('/sws/neo/financial-account/account/acc%201');
  });

  it('answers null for a refusal or a broken body (the avatar then shows its generic icon)', async () => {
    await expect(fetchAccountLogo(vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 403 })), 'a')).resolves.toBeNull();
    await expect(fetchAccountLogo(vi.fn().mockResolvedValue(brokenJsonResponse({ ok: true, status: 200 })), 'a')).resolves.toBeNull();
    await expect(fetchAccountLogo(vi.fn().mockRejectedValue(new Error('net')), 'a')).resolves.toBeNull();
  });

  it('a record without a logo yields a null providerLogoUrl', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: [{ type: 'C' }] } }));
    await expect(fetchAccountLogo(apiFetch, 'a')).resolves.toEqual({ providerLogoUrl: null, type: 'C' });
  });
});
