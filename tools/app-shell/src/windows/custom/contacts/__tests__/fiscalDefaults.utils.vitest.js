/**
 * Tests for useSiiTbaiActive (ETP-4784) — SII / TicketBAI active-config
 * detection for FiscalDefaultsSection, plus resolveOrganizationId.
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

function ok(rows) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: rows } }) });
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

  it('resolves loading:false, sii:false, tbai:false when organizationId is falsy', async () => {
    const { result } = renderHook(() => useSiiTbaiActive(null, '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: false, tbai: false });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('resolves sii:true when an active siiConfiguration record has acogidaAlSII truthy', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('sii-config')) return ok([{ active: true, acogidaAlSII: true }]);
      return ok([]);
    });
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sii).toBe(true);
    expect(result.current.tbai).toBe(false);
  });

  it('resolves sii:false when the siiConfiguration record has acogidaAlSII falsy', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('sii-config')) return ok([{ active: true, acogidaAlSII: false }]);
      return ok([]);
    });
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sii).toBe(false);
  });

  it('ignores an inactive siiConfiguration record in favor of an active one', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('sii-config')) {
        return ok([{ active: false, acogidaAlSII: true }, { active: true, acogidaAlSII: false }]);
      }
      return ok([]);
    });
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sii).toBe(false);
  });

  it('resolves tbai:true from the mere existence of an active tbai-config/header record', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('tbai-config')) return ok([{ active: true }]);
      return ok([]);
    });
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tbai).toBe(true);
  });

  it('resolves tbai:false when there is no tbai-config record', async () => {
    mockApiFetch.mockImplementation(() => ok([]));
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tbai).toBe(false);
  });

  it('fail-safe: degrades to sii:false, tbai:false on a fetch rejection', async () => {
    mockApiFetch.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: false, tbai: false });
  });

  it('fail-safe: degrades to false on a non-ok response (e.g. 404, module not installed)', async () => {
    mockApiFetch.mockImplementation(() => fail(404));
    const { result } = renderHook(() => useSiiTbaiActive('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, sii: false, tbai: false });
  });
});
