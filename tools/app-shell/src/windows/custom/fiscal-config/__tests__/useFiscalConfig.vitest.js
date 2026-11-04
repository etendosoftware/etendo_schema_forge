// @covers tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js
import { renderHook, waitFor, act } from '@testing-library/react';

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

// ETP-6053 — "Añadir SII" no longer builds a record in JS: it calls the organization's
// configureFiscalSystem action with the system only (the server takes TicketBAI's territory and
// derives every SII value), then reads the created record back.
describe('useFiscalConfig — createComplementary', () => {
  const ACTION = '/organization/organization/org-1/action/configureFiscalSystem';

  function jsonResponse(body, { ok = true, status = 200 } = {}) {
    return Promise.resolve({
      ok,
      status,
      statusText: ok ? 'OK' : 'Conflict',
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  let actionAnswer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectProfile).mockReturnValue('tbai');
    actionAnswer = () => jsonResponse({
      response: { data: { system: 'SII+TBAI', territory: 'alava', created: [{ system: 'SII', spec: 'sii-config', entity: 'siiConfiguration', id: 'sii-new' }] } },
    });
    mockApiFetch.mockImplementation((path) => {
      if (path.includes('/action/configureFiscalSystem')) return actionAnswer();
      if (path === '/sii-config/siiConfiguration/sii-new') {
        return jsonResponse({ response: { data: [{ id: 'sii-new', acogidaAlSII: 'Y', taxtype: 'IVA' }] } });
      }
      return makeSuccessResponse({ id: 'rec-1' });
    });
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  function actionCall() {
    return mockApiFetch.mock.calls.find(([path]) => path.includes('/action/configureFiscalSystem'));
  }

  async function renderLoaded() {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result;
  }

  it('POSTs {system: "SII"} with no territory to the configureFiscalSystem action', async () => {
    const result = await renderLoaded();

    await result.current.createComplementary('sii', 'org-1');

    const [path, opts] = actionCall();
    expect(path).toBe(ACTION);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ system: 'SII' });
  });

  it('never POSTs a config record directly (no complementary POST to sii-config)', async () => {
    const result = await renderLoaded();

    await result.current.createComplementary('sii', 'org-1');

    const posts = mockApiFetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe(ACTION);
  });

  it('returns the created SII record as read back from sii-config', async () => {
    const result = await renderLoaded();

    const created = await result.current.createComplementary('sii', 'org-1');

    expect(created).toEqual({ id: 'sii-new', acogidaAlSII: 'Y', taxtype: 'IVA' });
  });

  it('upper-cases the system it sends (tbai → TBAI)', async () => {
    actionAnswer = () => jsonResponse({
      response: { data: { created: [{ system: 'TBAI', id: 'tbai-new' }] } },
    });
    const result = await renderLoaded();

    const created = await result.current.createComplementary('tbai', 'org-1');

    expect(JSON.parse(actionCall()[1].body)).toEqual({ system: 'TBAI' });
    // The read-back answers the default record; what matters is it is keyed by the asked system.
    expect(created).toEqual({ id: 'rec-1' });
  });

  it('returns null when the action created no record of the asked system', async () => {
    actionAnswer = () => jsonResponse({ response: { data: { created: [] } } });
    const result = await renderLoaded();

    await expect(result.current.createComplementary('sii', 'org-1')).resolves.toBeNull();
  });

  it('throws with the server message when the action refuses', async () => {
    actionAnswer = () => jsonResponse(
      { error: { message: 'Ya hay un SIF activo', status: 409 } },
      { ok: false, status: 409 },
    );
    const result = await renderLoaded();

    await expect(result.current.createComplementary('sii', 'org-1')).rejects.toThrow('Ya hay un SIF activo');
  });
});

// After "Añadir SII" the hook's own state must already be the combined configuration: the page
// title and the "Estado" panel derive from `profile` / `siiRecord`, and they kept showing
// TicketBAI until a reload. Starts from a TicketBAI-only organization with the real profile
// detection, so the profile is derived from the records exactly as on a load.
describe('useFiscalConfig — createComplementary updates the state (SII added to TicketBAI)', () => {
  const TBAI_REC = { id: 'tbai-1', etsgSifTerritory: 'GIPUZKOA' };
  const SII_REC = { id: 'sii-new', acogidaAlSII: 'Y', taxtype: 'IVA' };

  function jsonResponse(body, { ok = true, status = 200 } = {}) {
    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  let actionAnswer;
  let defaultProfileImpl;

  beforeEach(async () => {
    vi.clearAllMocks();
    defaultProfileImpl = vi.mocked(detectProfile).getMockImplementation();
    const actual = await vi.importActual('../fiscalConfig.utils.js');
    vi.mocked(detectProfile).mockImplementation(actual.detectProfile);
    actionAnswer = () => jsonResponse({
      response: { data: { system: 'SII+TBAI', created: [{ system: 'SII', id: 'sii-new' }] } },
    });
    mockApiFetch.mockImplementation((path) => {
      if (path.includes('/action/configureFiscalSystem')) return actionAnswer();
      if (path === '/sii-config/siiConfiguration/sii-new') return jsonResponse({ response: { data: [SII_REC] } });
      if (path.startsWith('/tbai-config/header?')) return jsonResponse({ response: { data: [TBAI_REC] } });
      return jsonResponse({ response: { data: [] } });
    });
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  afterEach(() => {
    vi.mocked(detectProfile).mockImplementation(defaultProfileImpl);
  });

  const listReads = () => mockApiFetch.mock.calls.filter(([path]) => /\?organization=/.test(path)).length;

  async function renderTbaiOnly() {
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('tbai');
    expect(result.current.siiRecord).toBeNull();
    return result;
  }

  it('exposes profile "sii+tbai" and the created siiRecord once the call resolves, with no reload', async () => {
    const result = await renderTbaiOnly();
    const readsBefore = listReads();

    await act(() => result.current.createComplementary('sii', 'org-1'));

    expect(result.current.profile).toBe('sii+tbai');
    expect(result.current.siiRecord).toEqual(SII_REC);
    expect(result.current.tbaiRecord).toEqual(TBAI_REC);
    expect(result.current.loading).toBe(false);
    // Not a refetch: no list was read again.
    expect(listReads()).toBe(readsBefore);
  });

  it('leaves the profile and the records untouched when the action refuses', async () => {
    actionAnswer = () => jsonResponse(
      { error: { message: 'Ya hay un SIF activo', status: 409 } },
      { ok: false, status: 409 },
    );
    const result = await renderTbaiOnly();

    await act(async () => {
      await expect(result.current.createComplementary('sii', 'org-1')).rejects.toThrow('Ya hay un SIF activo');
    });

    expect(result.current.profile).toBe('tbai');
    expect(result.current.siiRecord).toBeNull();
    expect(result.current.tbaiRecord).toEqual(TBAI_REC);
    expect(result.current.error).toBeNull();
  });

  it('leaves the state untouched when the action created no SII record', async () => {
    actionAnswer = () => jsonResponse({ response: { data: { created: [] } } });
    const result = await renderTbaiOnly();

    await act(() => result.current.createComplementary('sii', 'org-1'));

    expect(result.current.profile).toBe('tbai');
    expect(result.current.siiRecord).toBeNull();
  });
});
