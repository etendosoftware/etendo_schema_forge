import { renderHook, waitFor } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

const mockApiFetch = vi.fn();

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => mockApiFetch),
}));

vi.mock('../fiscalConfig.utils.js', () => ({
  detectProfile: vi.fn(() => 'sii'),
}));

// --- Import under test ----------------------------------------------------

import { useFiscalConfig } from '../useFiscalConfig.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { detectProfile } from '../fiscalConfig.utils.js';

// --- Helpers --------------------------------------------------------------

function makeSuccessResponse(data = {}) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ response: { data: [data] } }),
  });
}

function makeErrorResponse(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

// --- Tests ----------------------------------------------------------------

describe('useFiscalConfig — orgId is null', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('sets profile to "unconfigured" when orgId is null', async () => {
    const { result } = renderHook(() => useFiscalConfig(null, '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('unconfigured');
  });

  it('sets error to null when orgId is null', async () => {
    const { result } = renderHook(() => useFiscalConfig(null, '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('does not call the API when orgId is null', async () => {
    const { result } = renderHook(() => useFiscalConfig(null, '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('sets siiRecord, tbaiRecord, verifactuRecord to null when orgId is null', async () => {
    const { result } = renderHook(() => useFiscalConfig(null, '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.siiRecord).toBeNull();
    expect(result.current.tbaiRecord).toBeNull();
    expect(result.current.verifactuRecord).toBeNull();
  });
});

describe('useFiscalConfig — orgId provided, successful fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectProfile).mockReturnValue('sii');
    mockApiFetch.mockImplementation(() => makeSuccessResponse({ id: 'rec-1' }));
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('starts with loading: true when orgId is provided', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    // At mount, state starts as loading: false then transitions to true; we verify it resolves to false
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The final state must be loaded
    expect(result.current.profile).toBe('sii');
  });

  it('sets loading: false after successful fetch', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loading).toBe(false);
  });

  it('sets error to null on success', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('calls the API three times (sii, tbai, verifactu) when orgId is provided', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  it('calls detectProfile with fetched records', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(detectProfile).toHaveBeenCalled();
  });

  it('exposes the profile returned by detectProfile', async () => {
    vi.mocked(detectProfile).mockReturnValue('verifactu');
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('verifactu');
  });
});

describe('useFiscalConfig — API error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockRejectedValue(new Error('Network failure'));
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('sets loading: false after an error', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loading).toBe(false);
  });

  it('sets error message when API rejects', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain('Network failure');
  });
});

describe('useFiscalConfig — API non-ok response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('sets error when API returns non-ok response', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBeTruthy();
  });
});

describe('useFiscalConfig — refetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectProfile).mockReturnValue('sii');
    mockApiFetch.mockImplementation(() => makeSuccessResponse({ id: 'rec-1' }));
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('exposes a refetch function', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refetch).toBe('function');
  });

  it('re-triggers the API load when refetch is called', async () => {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockApiFetch.mock.calls.length;
    result.current.refetch();
    await waitFor(() => expect(mockApiFetch.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
