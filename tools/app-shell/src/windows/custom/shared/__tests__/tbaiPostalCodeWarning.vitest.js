// @covers tools/app-shell/src/windows/custom/shared/tbaiPostalCodeWarning.js
//
// Unit coverage for the TicketBAI missing-postal-code advisory: the pure warning rule, the
// business-partner flag readers and the context hook. The rendered warning inside the address
// modal is covered in LocationEditorModal.vitest.jsx.
import { renderHook, waitFor } from '@testing-library/react';

// Every backend call goes through useApiFetch (docs/request-policy.md). One stable mock per base
// URL so the hook's effect dependencies stay stable across renders.
const fetchersByBase = new Map();
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => {
    if (!fetchersByBase.has(base)) {
      fetchersByBase.set(base, (url, opts) => mockApiFetch(`${base}${url}`, opts));
    }
    return fetchersByBase.get(base);
  },
}));

import {
  readPartnerCustomer,
  readPartnerSimplified,
  shouldWarnMissingTbaiPostalCode,
  useTbaiPostalCodeContext,
} from '../tbaiPostalCodeWarning.js';

const API_BASE = '/etendo/sws/neo/contacts';
const NEO_BASE = '/etendo/sws/neo';
const UNKNOWN = { tbaiActive: false, partnerCustomer: null, partnerSimplified: null };

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

/** Routes the two sources the hook reads: the partner record and the tbai-config list. */
function mockSources({ partner, partnerOk = true, tbaiRows = [], tbaiOk = true } = {}) {
  mockApiFetch.mockImplementation(async (url) => {
    if (url.includes('/businessPartner/')) {
      return jsonResponse({ response: { data: partner ? [partner] : [] } }, { ok: partnerOk, status: partnerOk ? 200 : 403 });
    }
    if (url.includes('/tbai-config/header')) {
      return jsonResponse({ response: { data: tbaiRows } }, { ok: tbaiOk, status: tbaiOk ? 200 : 403 });
    }
    throw new Error(`unexpected url ${url}`);
  });
}

function requestedUrls() {
  return mockApiFetch.mock.calls.map(([url]) => url);
}

describe('shouldWarnMissingTbaiPostalCode', () => {
  const WARN_BASE = { tbaiActive: true, partnerCustomer: true, partnerSimplified: false, postalCode: '' };

  it('warns for an active-TicketBAI, non-simplified customer with an empty postal code', () => {
    expect(shouldWarnMissingTbaiPostalCode(WARN_BASE)).toBe(true);
  });

  it.each([
    ['whitespace only', '   '],
    ['tabs and newlines', '\t\n '],
    ['null', null],
    ['undefined', undefined],
  ])('warns when the postal code is %s', (_label, postalCode) => {
    expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, postalCode })).toBe(true);
  });

  it('does not warn once a postal code is present', () => {
    expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, postalCode: '20001' })).toBe(false);
  });

  it('does not warn for a postal code surrounded by whitespace', () => {
    expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, postalCode: ' 20001 ' })).toBe(false);
  });

  it('does not warn when TicketBAI is not active', () => {
    expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, tbaiActive: false })).toBe(false);
  });

  it.each([
    ['not a customer', false],
    ['unknown (null)', null],
  ])('does not warn when the customer flag is %s', (_label, partnerCustomer) => {
    expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, partnerCustomer })).toBe(false);
  });

  it.each([
    ['simplified', true],
    ['unknown (null)', null],
  ])('does not warn when the simplified flag is %s', (_label, partnerSimplified) => {
    expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, partnerSimplified })).toBe(false);
  });

  it('does not warn when the customer flag is omitted', () => {
    const { partnerCustomer: _omitted, ...rest } = WARN_BASE;
    expect(shouldWarnMissingTbaiPostalCode(rest)).toBe(false);
  });

  it('does not warn when called with no input at all', () => {
    expect(shouldWarnMissingTbaiPostalCode()).toBe(false);
  });
});

describe('readPartnerCustomer', () => {
  it.each([
    ['Y', true],
    ['N', false],
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
    [undefined, null],
    [null, null],
    ['', null],
  ])('reads customer=%j as %j', (raw, expected) => {
    expect(readPartnerCustomer({ customer: raw })).toBe(expected);
  });

  it('returns null for a record without the property, or no record at all', () => {
    expect(readPartnerCustomer({ id: 'bp-1' })).toBeNull();
    expect(readPartnerCustomer(undefined)).toBeNull();
    expect(readPartnerCustomer(null)).toBeNull();
  });
});

describe('readPartnerSimplified', () => {
  it.each([
    ['Y', true],
    ['N', false],
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
    [undefined, null],
    [null, null],
    ['', null],
  ])('reads tbaiIssimplifiedinv=%j as %j', (raw, expected) => {
    expect(readPartnerSimplified({ tbaiIssimplifiedinv: raw })).toBe(expected);
  });

  it('returns null for a record without the property, or no record at all', () => {
    expect(readPartnerSimplified({ id: 'bp-1', customer: 'Y' })).toBeNull();
    expect(readPartnerSimplified(undefined)).toBeNull();
    expect(readPartnerSimplified(null)).toBeNull();
  });

  it('does not read the customer flag as the simplified flag', () => {
    expect(readPartnerSimplified({ customer: 'Y' })).toBeNull();
  });
});

describe('useTbaiPostalCodeContext', () => {
  const OPEN_PARAMS = { open: true, saveMode: 'bpartner', bpId: 'BP-1', apiBase: API_BASE };

  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('reports TicketBAI active for a non-simplified customer when an active config row exists', async () => {
    mockSources({
      partner: { id: 'BP-1', customer: 'Y', tbaiIssimplifiedinv: 'N' },
      tbaiRows: [{ id: 'cfg-old', active: 'N' }, { id: 'cfg-1', active: 'Y' }],
    });
    const { result } = renderHook(() => useTbaiPostalCodeContext(OPEN_PARAMS));
    await waitFor(() => expect(result.current.tbaiActive).toBe(true));
    expect(result.current).toEqual({ tbaiActive: true, partnerCustomer: true, partnerSimplified: false });
    expect(requestedUrls()).toContain(`${API_BASE}/businessPartner/BP-1`);
    expect(requestedUrls().some((u) => u.startsWith(`${NEO_BASE}/tbai-config/header?`))).toBe(true);
  });

  it('reports TicketBAI inactive when every config row is inactive', async () => {
    mockSources({
      partner: { id: 'BP-1', customer: 'Y', tbaiIssimplifiedinv: 'N' },
      tbaiRows: [{ id: 'cfg-old', active: 'N' }],
    });
    const { result } = renderHook(() => useTbaiPostalCodeContext(OPEN_PARAMS));
    await waitFor(() => expect(result.current.partnerCustomer).toBe(true));
    expect(result.current).toEqual({ tbaiActive: false, partnerCustomer: true, partnerSimplified: false });
  });

  it('URL-encodes the business partner id', async () => {
    mockSources({ partner: { id: 'a/b', customer: 'N', tbaiIssimplifiedinv: 'N' } });
    const { result } = renderHook(() => useTbaiPostalCodeContext({ ...OPEN_PARAMS, bpId: 'a/b' }));
    await waitFor(() => expect(result.current.partnerCustomer).toBe(false));
    expect(requestedUrls()).toContain(`${API_BASE}/businessPartner/a%2Fb`);
  });

  it.each([
    ['a supplier-only partner', { customer: 'N', tbaiIssimplifiedinv: 'N' }, { partnerCustomer: false, partnerSimplified: false }],
    ['a simplified customer', { customer: 'Y', tbaiIssimplifiedinv: 'Y' }, { partnerCustomer: true, partnerSimplified: true }],
    ['a partner without the simplified flag', { customer: 'Y' }, { partnerCustomer: true, partnerSimplified: null }],
  ])('skips the TicketBAI config lookup for %s', async (_label, flags, expected) => {
    mockSources({ partner: { id: 'BP-1', ...flags }, tbaiRows: [{ id: 'cfg-1', active: 'Y' }] });
    const { result } = renderHook(() => useTbaiPostalCodeContext(OPEN_PARAMS));
    await waitFor(() => expect(result.current.partnerCustomer).toBe(expected.partnerCustomer));
    expect(result.current).toEqual({ tbaiActive: false, ...expected });
    expect(requestedUrls().some((u) => u.includes('/tbai-config/header'))).toBe(false);
  });

  it('fails closed when the partner request is not ok', async () => {
    mockSources({ partner: { id: 'BP-1', customer: 'Y', tbaiIssimplifiedinv: 'N' }, partnerOk: false });
    const { result } = renderHook(() => useTbaiPostalCodeContext(OPEN_PARAMS));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(result.current).toEqual(UNKNOWN);
    expect(requestedUrls().some((u) => u.includes('/tbai-config/header'))).toBe(false);
  });

  it('fails closed when the TicketBAI config request is not ok', async () => {
    mockSources({
      partner: { id: 'BP-1', customer: 'Y', tbaiIssimplifiedinv: 'N' },
      tbaiRows: [{ id: 'cfg-1', active: 'Y' }],
      tbaiOk: false,
    });
    const { result } = renderHook(() => useTbaiPostalCodeContext(OPEN_PARAMS));
    await waitFor(() => expect(result.current.partnerCustomer).toBe(true));
    expect(result.current.tbaiActive).toBe(false);
  });

  it('fails closed when a request rejects', async () => {
    mockApiFetch.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useTbaiPostalCodeContext(OPEN_PARAMS));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(result.current).toEqual(UNKNOWN);
  });

  it.each([
    ['the modal is closed', { open: false }],
    ['the save mode is not bpartner', { saveMode: 'standalone' }],
    ['there is no business partner id', { bpId: undefined }],
    ['there is no api base', { apiBase: '' }],
  ])('does not request anything when %s', async (_label, override) => {
    mockSources({ partner: { id: 'BP-1', customer: 'Y', tbaiIssimplifiedinv: 'N' } });
    const { result } = renderHook(() => useTbaiPostalCodeContext({ ...OPEN_PARAMS, ...override }));
    expect(result.current).toEqual(UNKNOWN);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('resets to unknown when the modal closes', async () => {
    mockSources({
      partner: { id: 'BP-1', customer: 'Y', tbaiIssimplifiedinv: 'N' },
      tbaiRows: [{ id: 'cfg-1', active: 'Y' }],
    });
    const { result, rerender } = renderHook((props) => useTbaiPostalCodeContext(props), { initialProps: OPEN_PARAMS });
    await waitFor(() => expect(result.current.tbaiActive).toBe(true));
    rerender({ ...OPEN_PARAMS, open: false });
    expect(result.current).toEqual(UNKNOWN);
  });
});
