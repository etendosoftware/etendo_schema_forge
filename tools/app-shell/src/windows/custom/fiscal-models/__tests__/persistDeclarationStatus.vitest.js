import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { persistDeclarationStatus } from '../fiscalModelsUtils.js';

const OPTS = { token: 'tok', apiBaseUrl: 'http://host/neo/fiscal-models' };

describe('persistDeclarationStatus', () => {
  beforeEach(() => { vi.spyOn(global, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns { ok: false, error: "no_token" } when token is absent', async () => {
    const result = await persistDeclarationStatus('303-2026-T2', 'submitted', { apiBaseUrl: OPTS.apiBaseUrl });
    expect(result).toEqual({ ok: false, error: 'no_token' });
    expect(fetch).not.toHaveBeenCalled();
  });

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
      Authorization: 'Bearer tok',
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
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await persistDeclarationStatus('303-2026-T2', 'submitted', OPTS);
    expect(result).toEqual({ ok: false, error: 'http_404' });
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
