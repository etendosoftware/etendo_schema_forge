// @covers tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js
import { renderHook, waitFor } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

const mockApiFetch = vi.fn();

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => mockApiFetch),
}));

vi.mock('../fiscalConfig.utils.js', async (importActual) => ({
  ...(await importActual()),
  detectProfile: vi.fn(() => 'sii'),
}));

// --- Import under test ----------------------------------------------------

import { useFiscalConfig, earliestCutoverDate } from '../useFiscalConfig.js';
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

describe('earliestCutoverDate', () => {
  it('returns the raw value of the earliest row unchanged (not re-serialised)', () => {
    const rows = [{ fechaAcogidaSII: '2026-11-01' }, { fechaAcogidaSII: '2026-10-09' }];
    expect(earliestCutoverDate(rows, 'sii')).toBe('2026-10-09');
  });

  it('returns a timestamp row value exactly as received', () => {
    const raw = '2026-10-09T08:15:00Z';
    const rows = [{ inVfactuSystem: '2026-12-01T00:00:00Z' }, { inVfactuSystem: raw }];
    expect(earliestCutoverDate(rows, 'verifactu')).toBe(raw);
  });

  it('reads the field of the requested system only', () => {
    const rows = [{ tbaisystemdate: '2026-01-01', fechaAcogidaSII: '2026-05-05' }];
    expect(earliestCutoverDate(rows, 'tbai')).toBe('2026-01-01');
    expect(earliestCutoverDate(rows, 'sii')).toBe('2026-05-05');
  });

  it('skips rows without the field or with an unparsable value', () => {
    const rows = [{}, null, { tbaisystemdate: 'not-a-date' }, { tbaisystemdate: '2026-03-03' }];
    expect(earliestCutoverDate(rows, 'tbai')).toBe('2026-03-03');
  });

  it('returns null when no row carries the field', () => {
    expect(earliestCutoverDate([], 'sii')).toBeNull();
    expect(earliestCutoverDate([{ other: 'x' }], 'sii')).toBeNull();
  });

  // A date-only value is a LOCAL calendar day. Read as UTC midnight it lands at
  // 02:00 in Europe/Madrid and loses to a timestamp at 00:30 local of the same day.
  // Run under TZ=Europe/Madrid to exercise the east-of-UTC case.
  it('orders a date-only value before a timestamp later on the same local day', () => {
    const rows = [{ tbaisystemdate: '2026-10-09T00:30:00' }, { tbaisystemdate: '2026-10-09' }];
    expect(earliestCutoverDate(rows, 'tbai')).toBe('2026-10-09');
  });

  it('orders a timestamp on the previous local day before a date-only value', () => {
    const rows = [{ tbaisystemdate: '2026-10-09' }, { tbaisystemdate: '2026-10-08T23:30:00' }];
    expect(earliestCutoverDate(rows, 'tbai')).toBe('2026-10-08T23:30:00');
  });
});
