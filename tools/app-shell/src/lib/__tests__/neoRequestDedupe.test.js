// @covers tools/app-shell/src/lib/neoRequestDedupe.js
/**
 * ETP-4952 — one network read per resource per page load.
 *
 * Contracts, table-driven where the input is a URL:
 *   1. `dedupePolicyFor` — which requests are shared at all, and how. Only `GET .../sws/neo/session`
 *      is memoized; only a record's `header/<id>` and its `attachments/<table>/<id>[/main|/count]`
 *      are coalesced while in flight. A write, a list query, a `<id>/action/...` sub-resource and
 *      every other URL must be forwarded untouched.
 *   2. `isSessionMutationRequest` — every non-GET under `.../sws/(go|neo)/session`, which is what
 *      drops the memo (login, logout, entering an environment, switching role/org).
 *   3. The installed decorator: N concurrent reads of a coalesced resource reach the network once and
 *      every caller still gets a Response it can read on its own; the session is read once per page
 *      load; a record read after the previous one settled goes to the network again (no stale copy);
 *      a caller's abort rejects only that caller; requests are keyed by method + URL + Authorization.
 *   4. `src/main.jsx` installs it before the first request can be issued.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dedupePolicyFor,
  installNeoRequestDedupe,
  isSessionMutationRequest,
  resetNeoRequestDedupe,
  IN_FLIGHT,
  PAGE_MEMO,
} from '../neoRequestDedupe.js';

const APP_SHELL = resolve(import.meta.dirname, '../../..');

describe('dedupePolicyFor', () => {
  const cases = [
    ['/sws/neo/session', 'GET', PAGE_MEMO],
    ['/etendo/sws/neo/session', 'GET', PAGE_MEMO],
    ['http://localhost:3103/sws/neo/session', 'GET', PAGE_MEMO],
    ['/sws/neo/session?x=1', 'GET', PAGE_MEMO],
    ['/sws/neo/session', 'get', PAGE_MEMO],
    ['/sws/neo/sales-order/header/ABC123', 'GET', IN_FLIGHT],
    // Only the `header` entity is listed, because it is the one measured duplicated (the same
    // window's child-entity reads are served by the shared app-shell cache, ETP-4563). Extend
    // this table when another per-record read is shown to be duplicated.
    ['/sws/neo/contacts/businessPartner/ABC123', 'GET', null],
    ['/sws/neo/attachments/C_Order/ABC123', 'GET', IN_FLIGHT],
    ['/sws/neo/attachments/C_Order/ABC123/count', 'GET', IN_FLIGHT],
    ['/sws/neo/attachments/C_Order/ABC123/main', 'GET', IN_FLIGHT],
    ['/sws/neo/attachments/C_BPartner/ABC123/main?ts=1', 'GET', IN_FLIGHT],
    // Not the same resource: a write, a list query, an action sub-resource, another entity.
    ['/sws/neo/sales-order/header/ABC123', 'PATCH', null],
    ['/sws/neo/sales-order/header', 'GET', null],
    ['/sws/neo/sales-order/header/ABC123/action/listInvoices', 'GET', null],
    ['/sws/neo/sales-order/lines/defaults', 'GET', null],
    ['/sws/neo/attachments/C_Order/ABC123/file/XYZ', 'GET', null],
    ['/sws/neo/attachments/C_Order/ABC123/main', 'POST', null],
    ['/sws/go/session', 'GET', null],
    ['/sws/neo/myreportaccess', 'GET', null],
    ['not a url', 'GET', null],
    ['', 'GET', null],
  ];
  for (const [url, method, expected] of cases) {
    it(`${method} ${url || '(empty)'} → ${expected}`, () => {
      assert.equal(dedupePolicyFor(url, method), expected);
    });
  }
});

describe('isSessionMutationRequest', () => {
  const cases = [
    ['/sws/go/session', 'POST', true],
    ['/sws/go/session', 'DELETE', true],
    ['/sws/go/session/environment', 'POST', true],
    ['/etendo/sws/go/session/environment', 'POST', true],
    ['/sws/neo/session', 'POST', true],
    ['/sws/go/session', 'GET', false],
    ['/sws/go/session', 'HEAD', false],
    ['/sws/go/session/environment', 'OPTIONS', false],
    ['/sws/go/login', 'POST', false],
    ['/sws/neo/sales-order/header', 'POST', false],
    ['', 'POST', false],
  ];
  for (const [url, method, expected] of cases) {
    it(`${method} ${url || '(empty)'} → ${expected}`, () => {
      assert.equal(isSessionMutationRequest(url, method), expected);
    });
  }
});

describe('installed decorator', () => {
  let calls;
  let handler;
  let target;

  beforeEach(() => {
    calls = [];
    handler = async () => new Response(JSON.stringify({ currencyCode: 'EUR' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    target = {
      fetch: (...args) => {
        calls.push(args);
        return handler(...args);
      },
    };
    resetNeoRequestDedupe();
    installNeoRequestDedupe(target);
  });

  const jsonOf = async (res) => res.json();

  it('coalesces concurrent reads of one record header into a single request', async () => {
    const url = '/sws/neo/sales-order/header/ABC';
    const responses = await Promise.all([1, 2, 3].map(() => target.fetch(url)));
    assert.equal(calls.length, 1, 'three concurrent reads must reach the network once');
    assert.deepEqual(await Promise.all(responses.map(jsonOf)), [{ currencyCode: 'EUR' }, { currencyCode: 'EUR' }, { currencyCode: 'EUR' }]);
    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].headers.get('content-type'), 'application/json');
  });

  it('does not memoize a coalesced record read: the next one hits the network again', async () => {
    const url = '/sws/neo/attachments/C_Order/ABC/main';
    await target.fetch(url);
    await target.fetch(url);
    assert.equal(calls.length, 2, 'a record can change, so a settled read is never reused');
    resetNeoRequestDedupe();
    await target.fetch(url);
    assert.equal(calls.length, 3);
  });

  it('reads the session once for the whole page load, and again after a session mutation', async () => {
    await target.fetch('/sws/neo/session');
    await target.fetch('/sws/neo/session');
    await target.fetch('/sws/neo/session');
    assert.equal(calls.length, 1, 'the session payload is constant for a page load');

    // A GET of the go-session is not a mutation and must not drop the memo.
    await target.fetch('/sws/go/session');
    await target.fetch('/sws/neo/session');
    assert.equal(calls.length, 2, 'the go-session read is forwarded and kept');

    await target.fetch('/sws/go/session/environment', { method: 'POST' });
    await target.fetch('/sws/neo/session');
    assert.equal(calls.length, 4, 'entering an environment drops the memo on dispatch and on settle');
  });

  it('never memoizes a failed session read', async () => {
    handler = async () => new Response('{"error":{}}', { status: 401 });
    await target.fetch('/sws/neo/session');
    await target.fetch('/sws/neo/session');
    assert.equal(calls.length, 2, 'a 401 must not be served from the memo');
  });

  it('keys by Authorization: two different tokens never share a response', async () => {
    const url = '/sws/neo/sales-order/header/ABC';
    await Promise.all([
      target.fetch(url, { headers: { Authorization: 'Bearer one' } }),
      target.fetch(url, { headers: { Authorization: 'Bearer two' } }),
    ]);
    assert.equal(calls.length, 2);
  });

  it('rejects only the caller that aborted, and never hands its signal to the shared request', async () => {
    const url = '/sws/neo/sales-order/header/ABC';
    let release;
    handler = (...args) => {
      assert.equal(args[1].signal?.aborted, false);
      return new Promise((res) => { release = () => res(new Response('{"ok":true}', { status: 200 })); });
    };
    const aborted = new AbortController();
    const first = target.fetch(url, { signal: aborted.signal });
    const second = target.fetch(url);
    aborted.abort();
    await assert.rejects(first, (err) => err.name === 'AbortError');
    release();
    assert.deepEqual(await (await second).json(), { ok: true });
    assert.equal(calls.length, 1, 'one caller aborting must not cancel the shared read');
    assert.notEqual(calls[0][1].signal, aborted.signal, 'the shared request carries its own signal');
  });

  it('forwards every other request untouched, with the same init', async () => {
    const init = { method: 'PATCH', body: '{"a":1}' };
    await target.fetch('/sws/neo/sales-order/header/ABC/action/listInvoices', init);
    await target.fetch('/sws/neo/sales-order/header/ABC/action/listInvoices', init);
    await target.fetch('/sws/neo/sales-order/header');
    assert.equal(calls.length, 3);
    assert.equal(calls[0][1], init, 'the caller init is passed through by identity');
  });

  it('installs once: a second install returns the same wrapper', () => {
    const again = installNeoRequestDedupe(target);
    assert.equal(again, target.fetch);
    assert.equal(typeof again, 'function');
  });
});

describe('main.jsx wiring', () => {
  it('installs the decorator before rendering and before any request can be issued', () => {
    const source = readFileSync(resolve(APP_SHELL, 'src/main.jsx'), 'utf8');
    const install = source.indexOf('installNeoRequestDedupe()');
    assert.notEqual(install, -1, 'main.jsx must install the request decorator');
    assert.ok(install < source.indexOf('initFeatureFlags()'), 'install before the flags bootstrap');
    assert.ok(install < source.indexOf('createRoot('), 'install before the first render');
  });
});
