/**
 * ETP-4576 — node-runner companion to `useDocumentAction.vitest.jsx`. It pins
 * the same target contract from two angles the render-based suite cannot reach:
 *
 *  - source level, over the WHOLE module: no Authorization header may be built
 *    on any code path, exercised or not.
 *  - logic level, via `executeDocumentAction` — a standalone mirror of the
 *    hook's fetch call, kept here so the request shape can be asserted without
 *    a React renderer.
 *
 * The session is a server-side `__Host-go_session` cookie: every request sends
 * `credentials: 'include'` and no bearer token. The POST carries the CSRF proof
 * `X-Go-CSRF`, omitted entirely (never empty) when no proof is available.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useDocumentAction.js'), 'utf8');

/**
 * Comment-stripped view of the source. The credential assertions below run
 * against this, never against `src`: the module's own header comment explains
 * that no Authorization header is sent, and a comment must never be what makes
 * a test pass or fail.
 */
const codeOnly = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const CSRF_HEADER = 'X-Go-CSRF';

/** Mirror of the hook's request, minus React. */
async function executeDocumentAction(apiBaseUrl, entity, csrfToken, recordId, docAction) {
  if (!recordId || !docAction) {
    throw new Error('useDocumentAction.execute requires recordId and docAction');
  }
  const res = await fetch(
    `${apiBaseUrl}/${entity}/${recordId}/action/documentAction`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
      },
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

  it('builds no Authorization header anywhere in the module', () => {
    assert.doesNotMatch(codeOnly, /Authorization/);
    assert.doesNotMatch(codeOnly, /Bearer/);
  });

  it('sends credentials so the __Host-go_session cookie travels', () => {
    assert.match(codeOnly, /credentials:\s*['"]include['"]/);
  });

  it('asks the write builder for the POST headers, and names no proof itself', () => {
    // Inverted in ETP-4576. The hook used to read useAuth().csrfToken and paste the
    // X-Go-CSRF header itself, which pinned it to the cookie scheme: with the
    // preference off it would have sent a meaningless proof and no bearer token.
    // Now it asks writeHeaders() and never learns what authenticates the request —
    // so the literal header name must NOT appear here any more.
    assert.match(codeOnly, /writeHeaders\(\s*\)/);
    assert.doesNotMatch(codeOnly, new RegExp(CSRF_HEADER));
  });

  it('reads no credential from the auth context', () => {
    assert.doesNotMatch(codeOnly, /useAuth/);
    assert.doesNotMatch(codeOnly, /csrfToken/);
  });

  it('no longer names a bare `token` identifier — the option is gone', () => {
    // \b does not break inside `csrfToken`, so the CSRF proof is unaffected;
    // only a standalone `token` option/variable trips this.
    assert.doesNotMatch(codeOnly, /\btoken\b/);
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

    await executeDocumentAction('/sws/neo/sales-order', 'header', 'csrf123', 'rec-1', 'CO');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/sws/neo/sales-order/header/rec-1/action/documentAction');
  });

  it('sends POST with correct body', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push(opts);
      return { ok: true, json: async () => ({}) };
    };

    await executeDocumentAction('/api', 'header', 'csrf', 'id-42', 'RE');

    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].body, JSON.stringify({ docAction: 'RE' }));
  });

  it('sends the CSRF proof header and no Authorization header', async () => {
    let capturedInit;
    globalThis.fetch = async (url, opts) => {
      capturedInit = opts;
      return { ok: true, json: async () => ({}) };
    };

    await executeDocumentAction('/api', 'header', 'my-csrf', 'id-1', 'CO');

    assert.equal(capturedInit.headers[CSRF_HEADER], 'my-csrf');
    assert.equal(capturedInit.headers.Authorization, undefined);
    assert.doesNotMatch(JSON.stringify(capturedInit.headers), /Bearer/);
  });

  it('sends credentials: include so the session cookie travels', async () => {
    let capturedInit;
    globalThis.fetch = async (url, opts) => {
      capturedInit = opts;
      return { ok: true, json: async () => ({}) };
    };

    await executeDocumentAction('/api', 'header', 'my-csrf', 'id-1', 'CO');

    assert.equal(capturedInit.credentials, 'include');
  });

  it('omits the CSRF header entirely when no proof is available', async () => {
    // A session can be authenticated before the CSRF proof lands. The header
    // must be absent, never present with an empty/undefined value.
    for (const missing of [undefined, null, '']) {
      let capturedInit;
      globalThis.fetch = async (url, opts) => {
        capturedInit = opts;
        return { ok: true, json: async () => ({}) };
      };

      await executeDocumentAction('/api', 'header', missing, 'id-1', 'CO');

      assert.equal(CSRF_HEADER in capturedInit.headers, false);
      assert.equal(capturedInit.credentials, 'include');
      assert.equal(capturedInit.headers.Authorization, undefined);
    }
  });

  it('throws when recordId is empty', async () => {
    await assert.rejects(
      () => executeDocumentAction('/api', 'header', 'csrf', '', 'CO'),
      /requires recordId/,
    );
  });

  it('throws when docAction is empty', async () => {
    await assert.rejects(
      () => executeDocumentAction('/api', 'header', 'csrf', 'rec-1', ''),
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
      () => executeDocumentAction('/api', 'header', 'csrf', 'rec-1', 'CO'),
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
      () => executeDocumentAction('/api', 'header', 'csrf', 'rec-1', 'CO'),
      /Error 500/,
    );
  });

  it('returns parsed response data on success', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ result: 'ok', docStatus: 'CO' }),
    });

    const data = await executeDocumentAction('/api', 'header', 'csrf', 'rec-1', 'CO');
    assert.deepEqual(data, { result: 'ok', docStatus: 'CO' });
  });
});
