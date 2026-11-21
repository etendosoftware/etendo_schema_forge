// @covers tools/app-shell/src/lib/sepaCreditorIdApi.js
//
// The creditor identifier read/save contract (remittance header actions sepaFileData / saveCreditorId),
// over an injected apiFetch. The error message goes through the real backendErrors translator.
import {
  ACTION_BASE_ABSOLUTE,
  ACTION_BASE_IN_SPEC,
  CREDITOR_SOURCE,
  creditorIdSaveErrorMessage,
  fetchCreditorIdInfo,
  normalizeCreditorIdInfo,
  notifyCreditorIdSaved,
  onCreditorIdSaved,
  saveCreditorId,
} from '../sepaCreditorIdApi.js';

const json = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });
const data = (payload) => json({ response: { data: payload } });
const dictionary = {
  'backendError.sepaCreditorIdInvalidFormat': 'T:format',
  'sepaCreditorIdSaveError': 'T:saveError',
  'sepaCreditorIdInvalidCheckDigitsExpected': 'T:expected',
};
const ui = (key, params) => (key === 'sepaCreditorIdInvalidCheckDigitsExpected' ? `T:expected:${params.digits}` : (dictionary[key] ?? key));

describe('normalizeCreditorIdInfo', () => {
  it('keeps the remittance / account / suggested / source keys', () => {
    expect(normalizeCreditorIdInfo({
      remittanceCreditorId: 'ES82000B87654323', remittanceCreditorIdValid: true,
      accountCreditorId: 'ES97000B12345678', accountCreditorIdValid: true, suggestedCreditorId: 'ES12000B12345678',
      creditorIdSource: 'remittance', creditorId: 'ES82000B87654323', creditorIdAvailable: true,
    })).toEqual({
      remittanceCreditorId: 'ES82000B87654323', remittanceCreditorIdValid: true,
      accountCreditorId: 'ES97000B12345678', accountCreditorIdValid: true, suggestedCreditorId: 'ES12000B12345678',
      creditorIdSource: 'remittance', creditorId: 'ES82000B87654323', creditorIdAvailable: true,
    });
  });

  it('defaults an empty payload to «missing»', () => {
    expect(normalizeCreditorIdInfo(null)).toEqual({
      remittanceCreditorId: null, remittanceCreditorIdValid: null, accountCreditorId: null, accountCreditorIdValid: null,
      suggestedCreditorId: null, creditorIdSource: CREDITOR_SOURCE.missing, creditorId: null, creditorIdAvailable: false,
    });
  });

  it('infers the source when the backend omits it (remittance, account, suggested), and the effective value', () => {
    expect(normalizeCreditorIdInfo({ suggestedCreditorId: 'ES12000B12345678' })).toMatchObject({ creditorIdSource: 'suggested', creditorId: 'ES12000B12345678', creditorIdAvailable: false });
    expect(normalizeCreditorIdInfo({ accountCreditorId: 'ES82000B87654323' })).toMatchObject({ creditorIdSource: 'account', creditorId: 'ES82000B87654323' });
    expect(normalizeCreditorIdInfo({ remittanceCreditorId: 'ES82000B87654323', accountCreditorId: 'X' })).toMatchObject({ creditorIdSource: 'remittance', creditorId: 'ES82000B87654323' });
  });

  it('ignores an unknown source, a non-boolean validity and the retired legacy aliases', () => {
    const info = normalizeCreditorIdInfo({ creditorIdSource: 'weird', accountCreditorIdValid: 'yes', storedCreditorId: 'ES82000B87654323', storedCreditorIdValid: true });
    expect(info).toMatchObject({ creditorIdSource: 'missing', accountCreditorIdValid: null, accountCreditorId: null, creditorId: null });
    expect(info).not.toHaveProperty('storedCreditorId');
    expect(info).not.toHaveProperty('storedCreditorIdValid');
  });
});

describe('fetchCreditorIdInfo', () => {
  it('posts the account (and the organization when known) on the record segment', async () => {
    const apiFetch = vi.fn().mockResolvedValue(data({ suggestedCreditorId: 'ES12000B12345678', creditorIdSource: 'suggested' }));
    const info = await fetchCreditorIdInfo(apiFetch, ACTION_BASE_IN_SPEC, { recordId: 'rem 1', accountId: 'acc-1', organizationId: 'org-1' });
    expect(apiFetch).toHaveBeenCalledWith('/remittance/rem%201/action/sepaFileData', { method: 'POST', body: JSON.stringify({ accountId: 'acc-1', organizationId: 'org-1' }) });
    expect(info.creditorIdSource).toBe('suggested');
  });

  it('uses the `new` record when there is no remittance, with the absolute base', async () => {
    const apiFetch = vi.fn().mockResolvedValue(data({}));
    await fetchCreditorIdInfo(apiFetch, ACTION_BASE_ABSOLUTE, { recordId: null, accountId: 'acc-1' });
    expect(apiFetch).toHaveBeenCalledWith('/sws/neo/remittance/remittance/new/action/sepaFileData', { method: 'POST', body: JSON.stringify({ accountId: 'acc-1' }) });
  });

  it('throws with status and body on a refusal', async () => {
    const apiFetch = vi.fn().mockResolvedValue(json({ error: { messageKeys: ['ETGO_RemittanceAccountNotAllowed'] } }, { ok: false, status: 422 }));
    await expect(fetchCreditorIdInfo(apiFetch, ACTION_BASE_IN_SPEC, { accountId: 'a' })).rejects.toMatchObject({ status: 422 });
  });
});

describe('saveCreditorId', () => {
  it('posts a flat body and returns the new state', async () => {
    const apiFetch = vi.fn().mockResolvedValue(data({ remittanceCreditorId: 'ES82000B87654323', creditorIdSource: 'remittance' }));
    const info = await saveCreditorId(apiFetch, ACTION_BASE_IN_SPEC, { recordId: 'rem-1', accountId: 'acc-1', creditorId: 'ES82000B87654323', organizationId: 'org-1' });
    expect(apiFetch).toHaveBeenCalledWith('/remittance/rem-1/action/saveCreditorId', {
      method: 'POST', body: JSON.stringify({ accountId: 'acc-1', creditorId: 'ES82000B87654323', organizationId: 'org-1' }),
    });
    expect(info).toMatchObject({ remittanceCreditorId: 'ES82000B87654323', creditorIdSource: 'remittance' });
  });

  it('adds saveToAccount only when asked (the remittance copy is saved on its own otherwise)', async () => {
    const apiFetch = vi.fn().mockResolvedValue(data({}));
    await saveCreditorId(apiFetch, ACTION_BASE_IN_SPEC, { recordId: 'rem-1', accountId: 'acc-1', creditorId: 'X' });
    await saveCreditorId(apiFetch, ACTION_BASE_IN_SPEC, { recordId: 'rem-1', accountId: 'acc-1', creditorId: 'X', saveToAccount: true });
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ accountId: 'acc-1', creditorId: 'X' });
    expect(JSON.parse(apiFetch.mock.calls[1][1].body)).toEqual({ accountId: 'acc-1', creditorId: 'X', saveToAccount: true });
  });

  it('omits the organization when unknown', async () => {
    const apiFetch = vi.fn().mockResolvedValue(data({}));
    await saveCreditorId(apiFetch, ACTION_BASE_ABSOLUTE, { accountId: 'acc-1', creditorId: 'X' });
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ accountId: 'acc-1', creditorId: 'X' });
  });

  it('throws with the refusal body', async () => {
    const apiFetch = vi.fn().mockResolvedValue(json({ error: { message: 'bad', messageKeys: ['ETGO_SepaCreditorIdInvalidFormat'] } }, { ok: false, status: 422 }));
    await expect(saveCreditorId(apiFetch, ACTION_BASE_IN_SPEC, { accountId: 'a', creditorId: 'x' })).rejects.toMatchObject({ status: 422, body: { error: { messageKeys: ['ETGO_SepaCreditorIdInvalidFormat'] } } });
  });
});

describe('creditorIdSaveErrorMessage', () => {
  const err = (error) => Object.assign(new Error('x'), { body: { error } });

  it('translates the refusal by its message key', () => {
    expect(creditorIdSaveErrorMessage(err({ message: 'raw', messageKeys: ['ETGO_SepaCreditorIdInvalidFormat'] }), ui)).toBe('T:format');
  });

  it('adds the check digits the server expects', () => {
    expect(creditorIdSaveErrorMessage(err({ messageKeys: ['ETGO_SepaCreditorIdInvalidCheckDigits'], expectedCheckDigits: '82' }), ui)).toBe('T:expected:82');
  });

  it('falls back to the generic text', () => {
    expect(creditorIdSaveErrorMessage(new Error(''), ui)).toBe('T:saveError');
  });
});

describe('saved notifications', () => {
  it('reach the listeners of that account only, and stop after the unsubscribe', () => {
    const mine = vi.fn();
    const other = vi.fn();
    const stopMine = onCreditorIdSaved('acc-1', mine);
    const stopOther = onCreditorIdSaved('acc-2', other);
    notifyCreditorIdSaved('acc-1');
    expect(mine).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    stopMine();
    notifyCreditorIdSaved('acc-1');
    expect(mine).toHaveBeenCalledTimes(1);
    stopOther();
  });
});
