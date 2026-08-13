// ---------------------------------------------------------------------------
// Unit tests for the inline-create helpers in InlineCreateSelector.jsx (ETP-4099).
//
// `buildCreateUrl` derives an FK target's own NEO W endpoint from the host window's
// apiBaseUrl (swapping the spec segment); `createLookupRecord` POSTs { name } there
// and returns the created { id, name }, throwing on a non-ok response or missing id
// so the create modal can surface the error.
//
// Pure-logic tests — no rendering. i18n is mocked (the module transitively imports it)
// and global.fetch is stubbed like the sibling CreatableSearchSelect.vitest.jsx suite.
// ---------------------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { buildCreateUrl, createLookupRecord } from '../InlineCreateSelector.jsx';

const API_BASE = '/sws/neo/match-rule';
const TOKEN = 'test-token';
const base = { apiBaseUrl: API_BASE, createSpec: 'transaction-type', createEntity: 'transactionType', token: TOKEN };

function okResponse(json) {
  return { ok: true, json: async () => json };
}

describe('buildCreateUrl', () => {
  it('swaps the host spec segment for the target spec + entity', () => {
    expect(buildCreateUrl('/sws/neo/match-rule', 'transaction-type', 'transactionType'))
      .toBe('/sws/neo/transaction-type/transactionType');
  });
});

describe('createLookupRecord', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('POSTs { name } to the FK target endpoint with the bearer token and returns the created record', async () => {
    global.fetch.mockResolvedValue(okResponse({ response: { data: [{ id: 'TT-1', name: 'Bank fee' }] } }));

    const created = await createLookupRecord({ ...base, name: 'Bank fee' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/sws/neo/transaction-type/transactionType');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    });
    expect(JSON.parse(opts.body)).toEqual({ name: 'Bank fee' });
    expect(created).toEqual({ id: 'TT-1', name: 'Bank fee' });
  });

  it('falls back to the supplied name when the envelope omits one', async () => {
    global.fetch.mockResolvedValue(okResponse({ response: { data: [{ id: 'TT-2' }] } }));

    const created = await createLookupRecord({ ...base, name: 'Deposit' });

    expect(created).toEqual({ id: 'TT-2', name: 'Deposit' });
  });

  it('surfaces the backend error message on a non-ok response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ response: { error: { message: 'Duplicate key' } } }),
    });

    await expect(createLookupRecord({ ...base, name: 'Bank fee' })).rejects.toThrow('Duplicate key');
  });

  it('throws when the response carries no id', async () => {
    global.fetch.mockResolvedValue(okResponse({ response: { data: [{ name: 'No id' }] } }));

    await expect(createLookupRecord({ ...base, name: 'No id' })).rejects.toThrow(/no id/i);
  });
});
