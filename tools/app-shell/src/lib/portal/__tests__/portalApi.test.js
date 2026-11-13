// @covers tools/app-shell/src/lib/portal/portalApi.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTAL_ERROR,
  fetchPortalDocument,
  fetchPortalDocumentPdf,
  fetchPortalDocuments,
  fetchPortalHome,
  fetchPortalIdentity,
  fetchPortalLogoBlob,
  renewPortalLink,
  resolvePortalBaseUrl,
} from '../portalApi.js';

/**
 * Read-only client of the Business Partner portal (ETP-5267).
 *
 * Two properties carry the plan's security invariants and are asserted here rather than left to
 * the page: the token travels in its own `X-Portal-Token` header and never in the URL (§5.4), and
 * unknown / revoked / out-of-scope collapse into one indistinguishable error code (§5.2), so
 * nothing downstream can branch on which of the three it was.
 */

const TOKEN = 'tok-abcdef0123456789';

/** A `fetch`-shaped response. `clone` is present because a real `Response` always has one. */
function jsonResponse(body, { status = 200 } = {}) {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    clone: () => jsonResponse(body, { status }),
    json: async () => body,
    blob: async () => null,
  };
}

/** A response whose body cannot be parsed — the portal must degrade, not throw. */
function unparseableResponse({ status = 200 } = {}) {
  const response = jsonResponse({}, { status });
  return { ...response, json: async () => { throw new SyntaxError('Unexpected token'); } };
}

function blobResponse(blob, { status = 200 } = {}) {
  const response = jsonResponse({}, { status });
  return { ...response, blob: async () => blob };
}

/** Records every call so the token/URL contract can be asserted on the arguments themselves. */
function recordingFetch(responder) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      return responder(path, options);
    },
  };
}

/** A request that never completed — offline, DNS, aborted. Transient, never "invalid link". */
function failingFetch(error = new TypeError('Failed to fetch')) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      throw error;
    },
  };
}

function expectPortalError(code, { status = null } = {}) {
  return (error) => {
    assert.equal(error.code, code, `expected code ${code}, got ${error.code}`);
    assert.equal(error.status, status);
    return true;
  };
}

describe('portal request contract', () => {
  it('sends the token in the X-Portal-Token header on every call, never in the URL', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}));

    await fetchPortalIdentity(fetchImpl, TOKEN);
    await fetchPortalHome(fetchImpl, TOKEN);
    await fetchPortalDocuments(fetchImpl, TOKEN, { kind: 'INVOICE', search: 'FV' });
    await fetchPortalDocument(fetchImpl, TOKEN, 'INVOICE', 'inv-1');
    await fetchPortalDocumentPdf(fetchImpl, TOKEN, 'INVOICE', 'inv-1');
    await fetchPortalLogoBlob(fetchImpl, TOKEN);
    await renewPortalLink(fetchImpl, TOKEN);

    // The header name is spelled out rather than taken from the module's constant: the servlet
    // in com.etendoerp.go reads this exact spelling, so a rename here must fail a test. The
    // header is what carries the token under the cookie credential scheme, where the shared
    // helper drops an explicit `token`; `token` stays so a bearer GO JWT never rides along.
    const getOptions = { token: TOKEN, headers: { 'X-Portal-Token': TOKEN }, on401: 'ignore' };
    // Exact shape, not a superset: an extra option here would be a silent policy change. Routes
    // are compared before the query string; `/documents` filters are asserted on their own below.
    assert.deepEqual(
      calls.map((call) => ({ route: call.path.split('?')[0], options: call.options })),
      [
        { route: '/sws/portal/me', options: getOptions },
        { route: '/sws/portal/home', options: getOptions },
        { route: '/sws/portal/documents', options: getOptions },
        { route: '/sws/portal/documents/invoice/inv-1', options: getOptions },
        { route: '/sws/portal/documents/invoice/inv-1/pdf', options: getOptions },
        { route: '/sws/portal/logo', options: getOptions },
        { route: '/sws/portal/renew', options: { ...getOptions, method: 'POST' } },
      ],
    );
    // The token must never reach the URL, query string included (plan §5.4).
    for (const call of calls) {
      assert.ok(
        !call.path.includes(TOKEN),
        `token leaked into the URL: ${call.path}`,
      );
    }
  });

  it('lower-cases the kind and escapes the id in the document and printable paths', async () => {
    const { fetchImpl, calls } = recordingFetch(() => blobResponse(null));

    await fetchPortalDocument(fetchImpl, TOKEN, 'SHIPMENT', 'a/b c');
    await fetchPortalDocumentPdf(fetchImpl, TOKEN, 'SHIPMENT', 'a/b c');

    assert.deepEqual(calls.map((call) => call.path), [
      '/sws/portal/documents/shipment/a%2Fb%20c',
      '/sws/portal/documents/shipment/a%2Fb%20c/pdf',
    ]);
  });

  it('resolves a base URL that is not the NEO one', () => {
    const baseUrl = resolvePortalBaseUrl();
    assert.equal(typeof baseUrl, 'string');
    assert.doesNotMatch(baseUrl, /\/sws\/neo/);
  });
});

describe('fetchPortalIdentity', () => {
  it('returns the link state, the entry document and both names when the backend has them', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({
      state: 'expired',
      entryDocument: { kind: ' invoice ', id: ' inv-9 ' },
      businessPartnerName: '  Cliente Uno  ',
      tenantName: 'Acme SA',
      hasLogo: true,
    }));

    assert.deepEqual(await fetchPortalIdentity(fetchImpl, TOKEN), {
      state: 'expired',
      entryDocument: { kind: 'invoice', id: 'inv-9' },
      entryKind: null,
      businessPartnerName: 'Cliente Uno',
      tenantName: 'Acme SA',
      hasLogo: true,
    });
  });

  it('degrades a blank or missing name to null instead of failing', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ businessPartnerName: '   ' }));

    assert.deepEqual(await fetchPortalIdentity(fetchImpl, TOKEN), {
      state: 'valid',
      entryDocument: null,
      entryKind: null,
      businessPartnerName: null,
      tenantName: null,
      hasLogo: false,
    });
  });

  it('degrades an unparseable body to no names rather than to an error screen', async () => {
    const { fetchImpl } = recordingFetch(() => unparseableResponse());

    assert.deepEqual(await fetchPortalIdentity(fetchImpl, TOKEN), {
      state: 'valid',
      entryDocument: null,
      entryKind: null,
      businessPartnerName: null,
      tenantName: null,
      hasLogo: false,
    });
  });

  // The page branches on `state` (only `valid` may read documents) and must not choke on what a
  // backend that predates link states sends: no state at all, which means a valid link.
  for (const [label, body, expected] of [
    ['passes unavailable through', { state: 'unavailable' }, { state: 'unavailable', entryDocument: null }],
    ['defaults an unknown state to valid', { state: 'revoked' }, { state: 'valid', entryDocument: null }],
    [
      'drops an entry document that has no id',
      { state: 'valid', entryDocument: { kind: 'invoice', id: '  ' } },
      { state: 'valid', entryDocument: null },
    ],
  ]) {
    it(label, async () => {
      const { fetchImpl } = recordingFetch(() => jsonResponse(body));

      const identity = await fetchPortalIdentity(fetchImpl, TOKEN);

      assert.deepEqual(
        { state: identity.state, entryDocument: identity.entryDocument },
        expected,
      );
    });
  }
});

describe('fetchPortalIdentity — entry kind', () => {
  // `entryKind` names the list to open when the link's own document is no longer visible. It is
  // meaningful only then: next to a visible entry document it would be a second, conflicting answer.
  for (const [label, body, expected] of [
    ['passes the kind through when the entry document is gone', { entryKind: ' ORDER ' }, 'ORDER'],
    [
      'ignores it while the entry document is still visible',
      { entryDocument: { kind: 'INVOICE', id: 'inv-1' }, entryKind: 'ORDER' },
      null,
    ],
    ['is null when the backend sends none', {}, null],
  ]) {
    it(label, async () => {
      const { fetchImpl } = recordingFetch(() => jsonResponse(body));

      assert.equal((await fetchPortalIdentity(fetchImpl, TOKEN)).entryKind, expected);
    });
  }
});

describe('renewPortalLink', () => {
  for (const [label, body, expected] of [
    ['reports a new link sent', { state: 'renewed', renewal: 'sent' }, { state: 'renewed', renewal: 'sent' }],
    [
      'reports a link sent recently instead of a second email',
      { state: 'renewed', renewal: 'recentlySent' },
      { state: 'renewed', renewal: 'recentlySent' },
    ],
    ['nulls an unknown renewal value', { state: 'renewed', renewal: 'queued' }, { state: 'renewed', renewal: null }],
    ['reports an unavailable customer with no renewal', { state: 'unavailable' }, { state: 'unavailable', renewal: null }],
  ]) {
    it(label, async () => {
      const { fetchImpl } = recordingFetch(() => jsonResponse(body));

      assert.deepEqual(await renewPortalLink(fetchImpl, TOKEN), expected);
    });
  }

  for (const status of [401, 403]) {
    it(`treats ${status} as a dead link`, async () => {
      const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status }));

      await assert.rejects(
        renewPortalLink(fetchImpl, TOKEN),
        expectPortalError(PORTAL_ERROR.invalidLink, { status }),
      );
    });
  }

  for (const status of [500, 503]) {
    it(`treats ${status} as a retryable loadFailed, not as a dead link`, async () => {
      const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status }));

      await assert.rejects(
        renewPortalLink(fetchImpl, TOKEN),
        expectPortalError(PORTAL_ERROR.loadFailed, { status }),
      );
    });
  }
});

describe('fetchPortalDocuments', () => {
  const queryOf = (calls) => Object.fromEntries(new URL(calls[0].path, 'http://portal').searchParams);

  for (const [label, filters, expected] of [
    [
      'sends every filter, the kind lower-cased and the search trimmed',
      {
        kind: 'INVOICE', statuses: ['CO', 'CL'], dateFrom: '2026-07-12', dateTo: '2026-08-12',
        search: '  FV/00  ', offset: 50, limit: 25,
      },
      {
        type: 'invoice', status: 'CO,CL', dateFrom: '2026-07-12', dateTo: '2026-08-12', q: 'FV/00',
        limit: '25', offset: '50',
      },
    ],
    [
      'omits empty filters, so "all statuses" asks for no status at all',
      { kind: 'ORDER', statuses: [], search: '   ' },
      { type: 'order', limit: '50', offset: '0' },
    ],
  ]) {
    it(label, async () => {
      const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}));

      await fetchPortalDocuments(fetchImpl, TOKEN, filters);

      assert.deepEqual(queryOf(calls), expected);
    });
  }

  it('normalizes the page and falls back to what arrived when the backend sends no count', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({
      documents: [{ kind: 'INVOICE', id: 'inv-1', documentNo: 'FV/0001', grandTotal: '1000.00', isCreditNote: true }],
      statuses: ['CO'],
      totals: [{ currency: 'EUR', count: 1, taxBase: '826.45', grandTotal: '1000' }],
    }));

    const page = await fetchPortalDocuments(fetchImpl, TOKEN, { kind: 'INVOICE', offset: 50 });

    assert.equal(page.totalCount, 1);
    assert.equal(page.offset, 50);
    assert.deepEqual(page.statuses, ['CO']);
    assert.deepEqual(page.totals, [{ currency: 'EUR', count: 1, taxBase: 826.45, grandTotal: 1000 }]);
    assert.deepEqual(
      { grandTotal: page.documents[0].grandTotal, isCreditNote: page.documents[0].isCreditNote },
      { grandTotal: 1000, isCreditNote: true },
    );
  });
});

describe('fetchPortalHome', () => {
  it('coerces the balances and keeps the tiles and recent documents', async () => {
    const tiles = { INVOICE: { count: 3, highlight: { code: 'overdue', count: 1 } } };
    const { fetchImpl } = recordingFetch(() => jsonResponse({
      balances: [{ currency: 'EUR', outstanding: '1210.50', pendingCount: 3, overdue: 'n/a' }],
      tiles,
      recent: [{ kind: 'ORDER', id: 'ord-1', documentNo: ' PV/0001 ' }],
    }));

    const home = await fetchPortalHome(fetchImpl, TOKEN);

    assert.deepEqual(home.balances, [{
      currency: 'EUR', outstanding: 1210.5, pendingCount: 3, overdue: null, overdueCount: 0, overdueSince: null,
    }]);
    assert.deepEqual(home.tiles, tiles);
    assert.deepEqual(home.recent.map((doc) => [doc.kind, doc.id, doc.documentNo]), [['ORDER', 'ord-1', 'PV/0001']]);
  });

  it('degrades an unparseable body to an empty home rather than to an error screen', async () => {
    const { fetchImpl } = recordingFetch(() => unparseableResponse());

    assert.deepEqual(await fetchPortalHome(fetchImpl, TOKEN), { balances: [], tiles: {}, recent: [] });
  });
});

describe('fetchPortalDocument', () => {
  it('normalizes lines, related documents and the printable flag', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({
      kind: 'INVOICE',
      id: 'inv-1',
      lines: [{ product: 'Tornillo', quantity: '1.5', unitPrice: '10', amount: '15' }],
      related: [{ kind: 'ORDER', id: 'ord-1' }],
    }));

    const document = await fetchPortalDocument(fetchImpl, TOKEN, 'INVOICE', 'inv-1');

    assert.deepEqual(
      [document.lines[0].quantity, document.lines[0].unitPrice, document.lines[0].amount],
      [1.5, 10, 15],
    );
    assert.deepEqual(document.related.map((doc) => [doc.kind, doc.id]), [['ORDER', 'ord-1']]);
    // A backend that does not say there is a printable shows "PDF no disponible", never a dead button.
    assert.equal(document.hasPdf, false);
  });
});

describe('fetchPortalDocumentPdf', () => {
  it('returns the streamed blob', async () => {
    const pdf = { size: 12, type: 'application/pdf' };
    const { fetchImpl } = recordingFetch(() => blobResponse(pdf));

    assert.equal(await fetchPortalDocumentPdf(fetchImpl, TOKEN, 'INVOICE', 'inv-1'), pdf);
  });
});

describe('invalid-link collapse (plan 5.2)', () => {
  // Unknown, revoked and out-of-scope must be indistinguishable: the backend answers 401, 403
  // or 404 for them, and every one has to arrive as the SAME code so no caller can build an
  // enumeration oracle out of the difference.
  for (const status of [401, 403, 404]) {
    it(`maps ${status} on /me to the single invalid-link code`, async () => {
      const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status }));

      await assert.rejects(
        fetchPortalIdentity(fetchImpl, TOKEN),
        expectPortalError(PORTAL_ERROR.invalidLink, { status }),
      );
    });
  }

  it('raises the identical code for all three statuses', async () => {
    const codes = [];
    for (const status of [401, 403, 404]) {
      const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status }));
      await fetchPortalIdentity(fetchImpl, TOKEN).catch((error) => codes.push(error.code));
    }

    assert.deepEqual(codes, [
      PORTAL_ERROR.invalidLink, PORTAL_ERROR.invalidLink, PORTAL_ERROR.invalidLink,
    ]);
  });
});

describe('transient failures stay distinct from a dead link', () => {
  it('maps a request that never completed to loadFailed', async () => {
    const cause = new TypeError('Failed to fetch');
    const { fetchImpl } = failingFetch(cause);

    await assert.rejects(fetchPortalIdentity(fetchImpl, TOKEN), (error) => {
      assert.equal(error.code, PORTAL_ERROR.loadFailed);
      assert.equal(error.status, null);
      assert.equal(error.cause, cause);
      return true;
    });
  });
});

describe('error mapping of the home, list, detail and printable calls', () => {
  // 401/403 always mean the token itself was rejected. A 404 is a dead link only on /home, which
  // is scoped to the token alone; on a list, a document or its printable it is one missing
  // record — the detail view tells "not available" from "failed" by that status.
  const { invalidLink, loadFailed, downloadFailed } = PORTAL_ERROR;
  const CALLS = [
    ['/home', (f) => fetchPortalHome(f, TOKEN), { 404: invalidLink, 500: loadFailed, network: loadFailed }],
    ['/documents', (f) => fetchPortalDocuments(f, TOKEN, { kind: 'ORDER' }), { 404: loadFailed, 500: loadFailed, network: loadFailed }],
    ['a document', (f) => fetchPortalDocument(f, TOKEN, 'ORDER', 'ord-1'), { 404: loadFailed, 500: loadFailed, network: loadFailed }],
    [
      'a printable',
      (f) => fetchPortalDocumentPdf(f, TOKEN, 'ORDER', 'ord-1'),
      { 404: downloadFailed, 500: downloadFailed, network: downloadFailed },
    ],
  ];

  for (const [label, call, expected] of CALLS) {
    for (const status of [401, 403, 404, 500]) {
      const code = status === 401 || status === 403 ? invalidLink : expected[status];
      it(`maps ${status} on ${label} to ${code}`, async () => {
        const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status }));

        await assert.rejects(call(fetchImpl), expectPortalError(code, { status }));
      });
    }

    it(`maps a request on ${label} that never completed to ${expected.network}`, async () => {
      const { fetchImpl } = failingFetch();

      await assert.rejects(call(fetchImpl), expectPortalError(expected.network));
    });
  }
});
