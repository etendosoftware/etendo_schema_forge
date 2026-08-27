import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useDocumentAction.js'), 'utf8');

async function executeDocumentAction(apiBaseUrl, entity, token, recordId, docAction) {
  if (!recordId || !docAction) {
    throw new Error('useDocumentAction.execute requires recordId and docAction');
  }
  const res = await fetch(
    `${apiBaseUrl}/${entity}/${recordId}/action/documentAction`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
      body: JSON.stringify({ docAction }),
    },
  );
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message = payload?.response?.message || payload?.message || `Error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return res.json().catch(() => null);
}

describe('useDocumentAction source', () => {
  it('exports useDocumentAction as named export', () => {
    assert.match(src, /export function useDocumentAction/);
  });

  it('defaults entity to header', () => {
    assert.match(src, /entity\s*=\s*['"]header['"]/);
  });

  it('POSTs to the documentAction endpoint', () => {
    assert.match(src, /action\/documentAction/);
    assert.match(src, /method:\s*['"]POST['"]/);
  });

  it('sends Authorization Bearer header', () => {
    // ETP-5022 — the header is no longer a literal here: it comes from the canonical
    // builder, which also attaches Accept-Language. Asserting the builder call is the
    // stronger check, and test/auth-header-policy.test.js fails the build if any file
    // goes back to hand-rolling the header.
    assert.match(src, /(authHeaders|buildHeaders)\s*\(/);
  });

  it('throws when recordId is missing', () => {
    assert.match(src, /!recordId/);
  });

  it('throws when docAction is missing', () => {
    assert.match(src, /!docAction/);
  });

  it('extracts error message from payload.response.message', () => {
    assert.match(src, /payload\?\.response\?\.message/);
  });

  it('exposes loading, error, and clearError', () => {
    assert.match(src, /loading/);
    assert.match(src, /clearError/);
  });
});

describe('executeDocumentAction logic', () => {
  it('builds the correct URL', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ status: 'success' }) };
    };

    await executeDocumentAction('/sws/neo/sales-order', 'header', 'tok123', 'rec-1', 'CO');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/sws/neo/sales-order/header/rec-1/action/documentAction');
  });

  it('sends POST with correct body', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push(opts);
      return { ok: true, json: async () => ({}) };
    };

    await executeDocumentAction('/api', 'header', 'token', 'id-42', 'RE');

    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].body, JSON.stringify({ docAction: 'RE' }));
  });

  it('sends Authorization header', async () => {
    let capturedHeaders;
    globalThis.fetch = async (url, opts) => {
      capturedHeaders = opts.headers;
      return { ok: true, json: async () => ({}) };
    };

    await executeDocumentAction('/api', 'header', 'my-token', 'id-1', 'CO');

    assert.equal(capturedHeaders.Authorization, 'Bearer my-token');
  });

  it('throws when recordId is empty', async () => {
    await assert.rejects(
      () => executeDocumentAction('/api', 'header', 'tok', '', 'CO'),
      /requires recordId/,
    );
  });

  it('throws when docAction is empty', async () => {
    await assert.rejects(
      () => executeDocumentAction('/api', 'header', 'tok', 'rec-1', ''),
      /requires recordId/,
    );
  });

  it('throws with server error message on non-ok response', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 422,
      json: async () => ({ response: { message: 'Cannot complete document' } }),
    });

    await assert.rejects(
      () => executeDocumentAction('/api', 'header', 'tok', 'rec-1', 'CO'),
      /Cannot complete document/,
    );
  });

  it('falls back to status code when payload has no message', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => null,
    });

    await assert.rejects(
      () => executeDocumentAction('/api', 'header', 'tok', 'rec-1', 'CO'),
      /Error 500/,
    );
  });

  it('returns parsed response data on success', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ result: 'ok', docStatus: 'CO' }),
    });

    const data = await executeDocumentAction('/api', 'header', 'tok', 'rec-1', 'CO');
    assert.deepEqual(data, { result: 'ok', docStatus: 'CO' });
  });
});
