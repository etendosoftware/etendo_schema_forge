import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { persistDeclarationStatus } from '../fiscalModelsUtils.js';

const OPTS = { token: 'tok', apiBaseUrl: 'http://host/neo/fiscal-models' };

describe('persistDeclarationStatus', () => {
  beforeEach(() => { vi.spyOn(global, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  // ETP-4576 — the absent-token case is gone: under the cookie scheme no client holds one, so
  // the guard would reject every authenticated user. A missing apiBaseUrl still short-circuits
  // and keeps the historical `no_token` code so callers stay unchanged.

  it('returns { ok: false, error: "no_token" } when apiBaseUrl is absent', async () => {
    const result = await persistDeclarationStatus('303-2026-T2', 'submitted', { token: OPTS.token });
    expect(result).toEqual({ ok: false, error: 'no_token' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns { ok: false, error: "no_token" } when no opts are passed at all', async () => {
    const result = await persistDeclarationStatus('303-2026-T2', 'submitted');
    expect(result).toEqual({ ok: false, error: 'no_token' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls PUT with the correct URL, headers and body, and returns { ok: true }', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const result = await persistDeclarationStatus('303-2026-T2', 'submitted', OPTS);

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://host/neo/fiscal303/declarations?id=303-2026-T2');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({
      Authorization: 'Bearer tok', 'Accept-Language': 'es_ES',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ status: 'submitted' });
  });

  it('encodes the declaration id in the URL', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    await persistDeclarationStatus('349 2026/T1', 'draft', OPTS);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain(encodeURIComponent('349 2026/T1'));
  });

  it('returns { ok: false, error: "http_<status>" } when the response is not ok', async () => {
    // ETP-5725 (reopened QA fix) — `.text()` is now read on failure too (to extract a
    // `[reason=...]` tag, see the describe block below), so this mock — like a real fetch
    // Response — must provide it.
    fetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    const result = await persistDeclarationStatus('303-2026-T2', 'submitted', OPTS);
    expect(result).toEqual({ ok: false, error: 'http_404', reason: undefined });
  });

  // ETP-5438 — a presentation echoes the snapshot the backend froze in the same request.
  it('returns the echoed submittedSnapshot alongside ok: true', async () => {
    const snapshot = { boxes: { 46: '123.45' }, summary: { result: '123.45' }, sources: [] };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, submittedSnapshot: snapshot }) });
    const result = await persistDeclarationStatus('303-2026-T2', 'submitted', OPTS);
    expect(result).toEqual({ ok: true, submittedSnapshot: snapshot });
  });

  it('stays { ok: true } when the body has no snapshot or cannot be parsed', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    expect(await persistDeclarationStatus('a', 'draft', OPTS)).toEqual({ ok: true });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('empty'); } });
    expect(await persistDeclarationStatus('a', 'submitted', OPTS)).toEqual({ ok: true });
  });

  // ETP-5725 (reopened QA fix, UX follow-up) — a 409 from
  // FiscalDeclCrudHandler#rejectReactivationWithSibling tags its message with a stable
  // `[reason=...]` marker (the only structured signal available, since this backend's
  // `sendError` has no JSON-body overload — see that guard's own doc). This parses it out so
  // FmListPage.jsx's `handleConfirmReactivate` can show a specific toast instead of a generic one.
  describe('reason extraction from a tagged 409 (ETP-5725)', () => {
    it('extracts "corrective_sibling_presented" from the error body', async () => {
      const body = JSON.stringify({
        error: { message: 'Cannot reactivate [reason=corrective_sibling_presented]: another declaration already exists for this period: decl1', status: 409 },
      });
      fetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => body });
      const result = await persistDeclarationStatus('decl1', 'draft', OPTS);
      expect(result).toEqual({ ok: false, error: 'http_409', reason: 'corrective_sibling_presented' });
    });

    it('extracts "sibling_exists" from the error body', async () => {
      const body = JSON.stringify({
        error: { message: 'Cannot reactivate [reason=sibling_exists]: another declaration already exists for this period: decl1', status: 409 },
      });
      fetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => body });
      const result = await persistDeclarationStatus('decl1', 'draft', OPTS);
      expect(result).toEqual({ ok: false, error: 'http_409', reason: 'sibling_exists' });
    });

    it('leaves reason undefined when the body has no [reason=...] tag at all', async () => {
      const body = JSON.stringify({ error: { message: 'Some other 409', status: 409 } });
      fetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => body });
      const result = await persistDeclarationStatus('decl1', 'draft', OPTS);
      expect(result).toEqual({ ok: false, error: 'http_409', reason: undefined });
    });

    it('leaves reason undefined when the body is unparseable JSON', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => 'not json' });
      const result = await persistDeclarationStatus('decl1', 'draft', OPTS);
      expect(result).toEqual({ ok: false, error: 'http_409', reason: undefined });
    });

    it('leaves reason undefined and does not throw when reading the body itself fails', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 409, text: () => Promise.reject(new Error('stream closed')) });
      const result = await persistDeclarationStatus('decl1', 'draft', OPTS);
      expect(result).toEqual({ ok: false, error: 'http_409', reason: undefined });
    });
  });

  it('returns { ok: false, error: "network" } when fetch throws', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await persistDeclarationStatus('303-2026-T2', 'submitted', OPTS);
    expect(result).toEqual({ ok: false, error: 'network' });
  });

  describe('submissionMethod (ETP-4755)', () => {
    it('includes submissionMethod in the PUT body when provided', async () => {
      fetch.mockResolvedValueOnce({ ok: true });
      await persistDeclarationStatus('303-2026-T2', 'submitted_ack', { ...OPTS, submissionMethod: 'manual_ack' });

      const [, init] = fetch.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ status: 'submitted_ack', submissionMethod: 'manual_ack' });
    });

    it('omits submissionMethod from the PUT body when not provided', async () => {
      fetch.mockResolvedValueOnce({ ok: true });
      await persistDeclarationStatus('303-2026-T2', 'submitted', OPTS);

      const [, init] = fetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).toEqual({ status: 'submitted' });
      expect(body).not.toHaveProperty('submissionMethod');
    });

    it('omits submissionMethod from the PUT body when explicitly undefined', async () => {
      fetch.mockResolvedValueOnce({ ok: true });
      await persistDeclarationStatus('303-2026-T2', 'submitted_ack', { ...OPTS, submissionMethod: undefined });

      const [, init] = fetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).not.toHaveProperty('submissionMethod');
    });

    it('omits submissionMethod from the PUT body when it is an empty string (falsy)', async () => {
      fetch.mockResolvedValueOnce({ ok: true });
      await persistDeclarationStatus('303-2026-T2', 'submitted_ack', { ...OPTS, submissionMethod: '' });

      const [, init] = fetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).not.toHaveProperty('submissionMethod');
    });
  });
});
