// Vitest tests for fetchDeclarationIncidents (ETP-4456) — GET /neo/fiscal303/incidents,
// mapping the backend's generic {code, message} rows into the shape IncidentsTab/SourcesTab
// expect. Mirrors persistDeclarationStatus.vitest.js's fetch-mocking pattern (sibling function
// in the same file).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDeclarationIncidents } from '../fiscalModelsUtils.js';
import {
  TEST_BEARER_TOKEN,
  declareBearerSession,
  declareCookieSession,
} from '@/test/sessionContract.js';

// ETP-4576: no `token` option — the credential comes from the active scheme.
const OPTS = { apiBaseUrl: 'http://host/neo/fiscal-models' };
const EMPTY = { blocking: 0, warning: 0, items: [] };

describe('fetchDeclarationIncidents', () => {
  beforeEach(() => { declareBearerSession(); vi.spyOn(global, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns the empty shape when apiBaseUrl is absent', async () => {
    const result = await fetchDeclarationIncidents('303-2026-T2', {});
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
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_BEARER_TOKEN}`,
    });

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

  it('computes blocking/warning as the actual mix of severities and preserves each row severity', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { code: 'EDID065', message: 'IBAN not allowed for this declaration type', severity: 'block' },
          { code: 'AVISO01', message: 'Possible mismatch in box 88', severity: 'warn' },
          { code: 'E0100803', message: 'Business name error', severity: 'block' },
          { code: 'AVISO02', message: 'Late submission warning', severity: 'warn' },
        ],
      }),
    });

    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);

    expect(result).toEqual({
      blocking: 2,
      warning: 2,
      items: [
        { origin: 'EDID065', message: 'IBAN not allowed for this declaration type', severity: 'block' },
        { origin: 'AVISO01', message: 'Possible mismatch in box 88', severity: 'warn' },
        { origin: 'E0100803', message: 'Business name error', severity: 'block' },
        { origin: 'AVISO02', message: 'Late submission warning', severity: 'warn' },
      ],
    });
  });

  it('returns blocking:0 and warning:items.length when every row is severity "warn"', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { code: 'AVISO01', message: 'Warning one', severity: 'warn' },
          { code: 'AVISO02', message: 'Warning two', severity: 'warn' },
          { code: 'AVISO03', message: 'Warning three', severity: 'warn' },
        ],
      }),
    });

    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);

    expect(result.blocking).toBe(0);
    expect(result.warning).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.items.every(i => i.severity === 'warn')).toBe(true);
  });

  it('defaults an unexpected/garbage severity value to "block" (defensive fallback)', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { code: 'BAD01', message: 'Unknown severity value', severity: 'info' },
          { code: 'BAD02', message: 'Empty string severity', severity: '' },
          { code: 'BAD03', message: 'Null severity', severity: null },
          { code: 'BAD04', message: 'Severity key entirely absent' },
        ],
      }),
    });

    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);

    expect(result).toEqual({
      blocking: 4,
      warning: 0,
      items: [
        { origin: 'BAD01', message: 'Unknown severity value', severity: 'block' },
        { origin: 'BAD02', message: 'Empty string severity', severity: 'block' },
        { origin: 'BAD03', message: 'Null severity', severity: 'block' },
        { origin: 'BAD04', message: 'Severity key entirely absent', severity: 'block' },
      ],
    });
  });

  // ── model param (ETP-4755) ─────────────────────────────────────────────────
  // FmListPage's list-row/KPI incidents refresh (fix 2) must be able to hit the
  // right per-model route for a 349 declaration too — the URL is built from the
  // new `model` option instead of always hardcoding "fiscal303".

  it('builds the URL against fiscal349/incidents when model: "349" is passed', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    await fetchDeclarationIncidents('349-2026-01', { ...OPTS, model: '349' });
    const url = fetch.mock.calls[0][0];
    expect(url).toBe('http://host/neo/fiscal349/incidents?id=349-2026-01');
  });

  it('still defaults to fiscal303/incidents when model is omitted (backward compat)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    await fetchDeclarationIncidents('303-2026-T2', OPTS);
    const url = fetch.mock.calls[0][0];
    expect(url).toBe('http://host/neo/fiscal303/incidents?id=303-2026-T2');
  });

  it('counts legacy rows (no severity key, pre-ETP-4456 data) as blocking alongside new warn rows', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { code: 'LEGACY01', message: 'Old incident persisted before severity column existed' },
          { code: 'LEGACY02', message: 'Another pre-existing row' },
          { code: 'AVISO01', message: 'New AEAT warning', severity: 'warn' },
        ],
      }),
    });

    const result = await fetchDeclarationIncidents('303-2026-T2', OPTS);

    expect(result).toEqual({
      blocking: 2,
      warning: 1,
      items: [
        { origin: 'LEGACY01', message: 'Old incident persisted before severity column existed', severity: 'block' },
        { origin: 'LEGACY02', message: 'Another pre-existing row', severity: 'block' },
        { origin: 'AVISO01', message: 'New AEAT warning', severity: 'warn' },
      ],
    });
  });
  // The other half of the switch. A GET carries no CSRF proof in either scheme;
  // what changes is that the bearer header disappears and the cookie must be
  // allowed to travel cross-origin.
  it('sends no Authorization header and no CSRF proof under the cookie scheme', async () => {
    declareCookieSession();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ incidents: [] }) });

    await fetchDeclarationIncidents('303-2026-T2', OPTS);

    const [, init] = fetch.mock.calls[0];
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.headers).not.toHaveProperty('X-Go-CSRF');
    expect(init.credentials).toBe('include');
  });
});
