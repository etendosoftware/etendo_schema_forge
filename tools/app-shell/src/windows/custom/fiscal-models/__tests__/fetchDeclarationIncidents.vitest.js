// Vitest tests for fetchDeclarationIncidents (ETP-4456) — GET /neo/fiscal303/incidents,
// mapping the backend's generic {code, message} rows into the shape IncidentsTab/SourcesTab
// expect. Mirrors persistDeclarationStatus.vitest.js's fetch-mocking pattern (sibling function
// in the same file).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDeclarationIncidents } from '../fiscalModelsUtils.js';

const OPTS = { token: 'tok', apiBaseUrl: 'http://host/neo/fiscal-models' };
const EMPTY = { blocking: 0, warning: 0, items: [] };

describe('fetchDeclarationIncidents', () => {
  beforeEach(() => { vi.spyOn(global, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns the empty shape when token is absent', async () => {
    const result = await fetchDeclarationIncidents('303-2026-T2', { apiBaseUrl: OPTS.apiBaseUrl });
    expect(result).toEqual(EMPTY);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the empty shape when apiBaseUrl is absent', async () => {
    const result = await fetchDeclarationIncidents('303-2026-T2', { token: OPTS.token });
    expect(result).toEqual(EMPTY);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the empty shape when id is absent', async () => {
    const result = await fetchDeclarationIncidents(undefined, OPTS);
    expect(result).toEqual(EMPTY);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the empty shape when no id/opts are passed at all', async () => {
    const result = await fetchDeclarationIncidents();
    expect(result).toEqual(EMPTY);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls GET with the correct URL and headers, and maps {code, message} rows', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { code: 'EDID065', message: 'IBAN not allowed for this declaration type' },
          { code: 'E0100803', message: 'Business name error' },
        ],
      }),
    });

    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://host/neo/fiscal303/incidents?id=303-2026-T2');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' });

    expect(result).toEqual({
      blocking: 2,
      warning: 0,
      items: [
        { origin: 'EDID065', message: 'IBAN not allowed for this declaration type', severity: 'block' },
        { origin: 'E0100803', message: 'Business name error', severity: 'block' },
      ],
    });
  });

  it('encodes the declaration id in the URL', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    await fetchDeclarationIncidents('349 2026/T1', OPTS);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain(encodeURIComponent('349 2026/T1'));
  });

  it('returns blocking:0, items:[] when data is an empty array (successful submit, no incidents)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);
    expect(result).toEqual(EMPTY);
  });

  it('defaults missing code/message on a row to empty strings', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{}] }) });
    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);
    expect(result).toEqual({
      blocking: 1,
      warning: 0,
      items: [{ origin: '', message: '', severity: 'block' }],
    });
  });

  it('treats a missing/non-array data field as no incidents', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);
    expect(result).toEqual(EMPTY);
  });

  it('returns the empty shape when the response is not ok', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);
    expect(result).toEqual(EMPTY);
  });

  it('returns the empty shape when fetch throws (network error)', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);
    expect(result).toEqual(EMPTY);
  });

  it('returns the empty shape when the response body is not valid JSON', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('bad json'); },
    });
    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);
    expect(result).toEqual(EMPTY);
  });
});
