/**
 * Tests for useSiiTbaiActive (ETP-4784) — SII / TicketBAI / Verifactu
 * active-config detection for FiscalDefaultsSection, plus resolveOrganizationId.
 *
 * As of the follow-up simplification, the hook does a SINGLE GET to
 * `/organizaci-n/information/{orgId}` and reads the 3 server-maintained
 * `AD_OrgInfo` flags (`etsgHasSIIConfig` / `etsgHasTbaiConfig` /
 * `etsgHasVfactuConfig`) instead of fetching+filtering the sii-config/
 * tbai-config lists.
 */
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => mockApiFetch),
}));

import { useSiiTbaiActive, resolveOrganizationId } from '../fiscalDefaults.utils.js';

function ok(data) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
}
function fail(status = 404) {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });
}

describe('resolveOrganizationId', () => {
  it('returns null for null/empty', () => {
    expect(resolveOrganizationId(null)).toBeNull();
    expect(resolveOrganizationId('')).toBeNull();
  });
  it('returns the string id for a raw value', () => {
    expect(resolveOrganizationId('org-1')).toBe('org-1');
  });
  it('extracts id from an object', () => {
    expect(resolveOrganizationId({ id: 'org-1' })).toBe('org-1');
  });
});

describe('useSiiTbaiActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves loading:false, sii:false, tbai:false, vfactuActive:false when organizationId is falsy, without fetching', async () => {
    const { result } = renderHook(() => useSiiTbaiActive(null, '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: false, tbai: false, vfactuActive: false });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('calls the single organization-info endpoint for the given orgId', async () => {
    mockApiFetch.mockImplementation(() => ok({}));
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/organizaci-n/information/org-1',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
  });

  it('resolves sii:true, tbai:true, vfactuActive:true when all three flags are truthy', async () => {
    mockApiFetch.mockImplementation(() =>
      ok({ etsgHasSIIConfig: true, etsgHasTbaiConfig: true, etsgHasVfactuConfig: true }),
    );
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: true, tbai: true, vfactuActive: true });
  });

  it('resolves only sii:true when just etsgHasSIIConfig is truthy (string "Y")', async () => {
    mockApiFetch.mockImplementation(() =>
      ok({ etsgHasSIIConfig: 'Y', etsgHasTbaiConfig: false, etsgHasVfactuConfig: 'N' }),
    );
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: true, tbai: false, vfactuActive: false });
  });

  it('resolves only tbai:true when just etsgHasTbaiConfig is truthy', async () => {
    mockApiFetch.mockImplementation(() =>
      ok({ etsgHasSIIConfig: false, etsgHasTbaiConfig: true, etsgHasVfactuConfig: false }),
    );
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: false, tbai: true, vfactuActive: false });
  });

  it('resolves sii:false, tbai:false, vfactuActive:false when all three flags are falsy/absent', async () => {
    mockApiFetch.mockImplementation(() => ok({}));
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: false, tbai: false, vfactuActive: false });
  });

  it('fail-safe: degrades to sii:false, tbai:false, vfactuActive:false on a fetch rejection (network error)', async () => {
    mockApiFetch.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: false, tbai: false, vfactuActive: false });
  });

  it('fail-safe: degrades to false on a non-ok response (e.g. 404, module not installed)', async () => {
    mockApiFetch.mockImplementation(() => fail(404));
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: false, tbai: false, vfactuActive: false });
  });
});
