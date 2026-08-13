// Mock heavy FmPrimitives dependencies before importing the module.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('lucide-react', () => ({
  TriangleAlert: () => null,
  ArrowUpRight: () => null,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fetchCsvAndDownload } from '../FmPrimitives.jsx';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Build a minimal fake apiFetch that returns the given payload. */
function makeFetch(payload, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
}

/** Suppress the browser-download side-effects inside buildCsvAndDownload. */
function suppressDownload() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockReturnValue({ click: vi.fn(), href: '', download: '' });
  vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
  vi.spyOn(globalThis, 'Blob').mockImplementation(function (parts, opts) {
    return new (vi.importActual ? Object : Blob)(parts, opts ?? {});
  });
}

const COLS = [{ label: 'ID', get: r => r.id }];

const SAMPLE_ROWS = [
  { id: 'A1' },
  { id: 'B2' },
];

describe('fetchCsvAndDownload — happy path', () => {
  beforeEach(suppressDownload);
  afterEach(() => vi.restoreAllMocks());

  it('calls apiFetch with the path and serialized query params', async () => {
    const apiFetch = makeFetch({ response: { data: SAMPLE_ROWS } });
    await fetchCsvAndDownload(apiFetch, '/test-spec/test-entity', { parentId: 'P1' }, 'export', COLS);
    expect(apiFetch).toHaveBeenCalledOnce();
    const calledUrl = apiFetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/^\/test-spec\/test-entity\?/);
    expect(calledUrl).toContain('parentId=P1');
  });

  it('triggers the file download (does not throw)', async () => {
    const apiFetch = makeFetch({ response: { data: SAMPLE_ROWS } });
    await expect(
      fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS)
    ).resolves.toBeUndefined();
  });

  it('passes all provided params to the URL', async () => {
    const apiFetch = makeFetch({ response: { data: [] } });
    await fetchCsvAndDownload(
      apiFetch,
      '/spec/entity',
      { organization: 'ORG-1', _startRow: '0' },
      'export',
      COLS
    );
    const calledUrl = apiFetch.mock.calls[0][0];
    expect(calledUrl).toContain('organization=ORG-1');
    expect(calledUrl).toContain('_startRow=0');
  });
});

describe('fetchCsvAndDownload — HTTP error', () => {
  afterEach(() => vi.restoreAllMocks());

  it('throws Error("HTTP 500") when response.ok is false and status is 500', async () => {
    const apiFetch = makeFetch({}, false, 500);
    await expect(
      fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS)
    ).rejects.toThrow('HTTP 500');
  });

  it('throws Error("HTTP 404") when response.ok is false and status is 404', async () => {
    const apiFetch = makeFetch({}, false, 404);
    await expect(
      fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS)
    ).rejects.toThrow('HTTP 404');
  });

  it('does NOT call document.createElement when the request fails', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    const apiFetch = makeFetch({}, false, 500);
    await fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS).catch(() => {});
    expect(createElementSpy).not.toHaveBeenCalled();
  });
});

describe('fetchCsvAndDownload — empty data', () => {
  beforeEach(suppressDownload);
  afterEach(() => vi.restoreAllMocks());

  it('does not throw when json.response.data is an empty array', async () => {
    const apiFetch = makeFetch({ response: { data: [] } });
    await expect(
      fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS)
    ).resolves.toBeUndefined();
  });

  it('still triggers the download (CSV with header only) for empty data', async () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const apiFetch = makeFetch({ response: { data: [] } });
    await fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS);
    expect(appendSpy).toHaveBeenCalledOnce();
  });
});

describe('fetchCsvAndDownload — missing response.data', () => {
  beforeEach(suppressDownload);
  afterEach(() => vi.restoreAllMocks());

  it('falls back to empty array when json has no response property', async () => {
    const apiFetch = makeFetch({});
    await expect(
      fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS)
    ).resolves.toBeUndefined();
  });

  it('falls back to empty array when json.response has no data property', async () => {
    const apiFetch = makeFetch({ response: {} });
    await expect(
      fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS)
    ).resolves.toBeUndefined();
  });

  it('falls back to empty array when json is null', async () => {
    const apiFetch = makeFetch(null);
    await expect(
      fetchCsvAndDownload(apiFetch, '/spec/entity', {}, 'export', COLS)
    ).resolves.toBeUndefined();
  });
});

describe('fetchCsvAndDownload — params filtering', () => {
  beforeEach(suppressDownload);
  afterEach(() => vi.restoreAllMocks());

  it('omits params with null values from the query string', async () => {
    const apiFetch = makeFetch({ response: { data: [] } });
    await fetchCsvAndDownload(
      apiFetch,
      '/spec/entity',
      { parentId: 'P1', extra: null },
      'export',
      COLS
    );
    const calledUrl = apiFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('extra=');
  });

  it('omits params with undefined values from the query string', async () => {
    const apiFetch = makeFetch({ response: { data: [] } });
    await fetchCsvAndDownload(
      apiFetch,
      '/spec/entity',
      { parentId: 'P1', extra: undefined },
      'export',
      COLS
    );
    const calledUrl = apiFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('extra=');
  });

  it('omits params with empty-string values from the query string', async () => {
    const apiFetch = makeFetch({ response: { data: [] } });
    await fetchCsvAndDownload(
      apiFetch,
      '/spec/entity',
      { parentId: 'P1', extra: '' },
      'export',
      COLS
    );
    const calledUrl = apiFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('extra=');
  });

  it('works with null params argument (no crash, no params in URL)', async () => {
    const apiFetch = makeFetch({ response: { data: [] } });
    await expect(
      fetchCsvAndDownload(apiFetch, '/spec/entity', null, 'export', COLS)
    ).resolves.toBeUndefined();
  });
});
