// Mocks must come before imports (Vitest hoisting)

import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useOrganizationData } from '../useOrganizationData.js';

const API_BASE_URL = '/sws/neo/organization';
const ORG_ID = 'ORG_1';

// NEO Headless wraps even a GET-by-id record in response.data[0] (an array),
// same as fetchBp() in fiscal-monitor/ContactDetailModal.jsx — never a bare object.
function jsonResponse(record, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => ({ response: { data: record == null ? [] : [record] } }) });
}

function makeFetchMock(handlers) {
  return vi.fn((url) => {
    for (const [substr, handler] of handlers) {
      if (url.includes(substr)) return handler();
    }
    return jsonResponse(null);
  });
}

describe('useOrganizationData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('orgId falsy', () => {
    it('does not fetch and returns nulls', () => {
      globalThis.fetch = vi.fn();
      const { result } = renderHook(() => useOrganizationData(null, API_BASE_URL));

      expect(result.current.loading).toBe(false);
      expect(result.current.header).toBeNull();
      expect(result.current.info).toBeNull();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('load', () => {
    it('loads header + info, including the direct AD_OrgInfo contact columns', async () => {
      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme', socialName: 'Acme S.A.', 'currency$_identifier': 'EUR', etgoBusinessType: 'CO' })],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({ taxID: 'B123', locationAddress: '', etgoEmail: 'hi@acme.com', etgoPhone: '123', etgoWeb: 'acme.com' })],
      ]);

      const { result } = renderHook(() => useOrganizationData(ORG_ID, API_BASE_URL));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.header.name).toBe('Acme');
      expect(result.current.info.taxID).toBe('B123');
      expect(result.current.info.etgoEmail).toBe('hi@acme.com');
      expect(result.current.info.etgoPhone).toBe('123');
      expect(result.current.info.etgoWeb).toBe('acme.com');

      const calledUrls = globalThis.fetch.mock.calls.map(([url]) => url);
      expect(calledUrls.some(u => u.includes('/contacts/'))).toBe(false);
    });
  });

  describe('load errors', () => {
    it('sets error and stops loading when the header request fails', async () => {
      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse(null, false, 500)],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({})],
      ]);

      const { result } = renderHook(() => useOrganizationData(ORG_ID, API_BASE_URL));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toMatch(/500/);
    });
  });

  describe('save', () => {
    it('PATCHes organization + information (including the etgoEmail/Phone/Web columns)', async () => {
      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme' })],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({ taxID: 'B123' })],
      ]);

      const { result } = renderHook(() => useOrganizationData(ORG_ID, API_BASE_URL));
      await waitFor(() => expect(result.current.loading).toBe(false));

      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse({})],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({})],
      ]);

      await result.current.save({
        header: { name: 'New Name' },
        info: { taxID: 'B999', etgoEmail: 'new@acme.com', etgoPhone: '456', etgoWeb: 'acme.io' },
      });

      const calls = globalThis.fetch.mock.calls;
      expect(calls.some(([url]) => url.includes('/contacts/'))).toBe(false);
      expect(calls.some(([url, opts]) => url.includes(`/organization/organization/${ORG_ID}`) && opts.method === 'PATCH')).toBe(true);
      const infoPatch = calls.find(([url, opts]) => url.includes(`/organization/information/${ORG_ID}`) && opts.method === 'PATCH');
      expect(infoPatch).toBeTruthy();
      expect(JSON.parse(infoPatch[1].body)).toMatchObject({ taxID: 'B999', etgoEmail: 'new@acme.com', etgoPhone: '456', etgoWeb: 'acme.io' });
    });

    it('throws when any of the PATCH requests fails', async () => {
      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme' })],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({})],
      ]);
      const { result } = renderHook(() => useOrganizationData(ORG_ID, API_BASE_URL));
      await waitFor(() => expect(result.current.loading).toBe(false));

      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse(null, false, 400)],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({})],
      ]);

      await expect(result.current.save({ header: { name: 'x' }, info: { taxID: 'y' } }))
        .rejects.toThrow(/400/);
    });
  });
});
