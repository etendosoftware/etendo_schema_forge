import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTAL_ERROR,
  fetchInvoicePdfBlob,
  fetchPortalIdentity,
  fetchPortalInvoices,
  normalizePortalInvoice,
  resolvePortalBaseUrl,
} from '../portalApi.js';

/**
 * Read-only client of the Business Partner portal (ETP-5267).
 *
 * Two properties carry the plan's security invariants and are asserted here rather than left to
 * the page: the token travels in the request OPTIONS and never in the URL (§5.4), and
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
  it('sends the token as a request option, never in the URL', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}));

    await fetchPortalIdentity(fetchImpl, TOKEN);
    await fetchPortalInvoices(fetchImpl, TOKEN);
    await fetchInvoicePdfBlob(fetchImpl, TOKEN, 'inv-1');

    assert.equal(calls.length, 3);
    for (const call of calls) {
      // Exact shape, not a superset: an extra option here would be a silent policy change.
      assert.deepEqual(call.options, { token: TOKEN, on401: 'ignore' });
      assert.ok(
        !call.path.includes(TOKEN),
        `token leaked into the URL: ${call.path}`,
      );
    }
  });

  it('targets the portal servlet, never the shared NEO CRUD engine', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}));

    await fetchPortalIdentity(fetchImpl, TOKEN);
    await fetchPortalInvoices(fetchImpl, TOKEN);
    await fetchInvoicePdfBlob(fetchImpl, TOKEN, 'inv-1');

    // Compared on the path before any query string: `/invoices` carries `?limit&offset` since
    // paging landed, and pinning that here would make this test fail on an unrelated page-size
    // change while still not guarding the thing it exists to guard.
    assert.deepEqual(calls.map((call) => call.path.split('?')[0]), [
      '/sws/portal/me',
      '/sws/portal/invoices',
      '/sws/portal/invoices/inv-1/pdf',
    ]);
    // The token must never reach the URL, query string included (plan §5.4).
    for (const call of calls) {
      assert.ok(!call.path.includes(TOKEN), `token leaked into ${call.path}`);
    }
  });

  it('escapes the invoice id in the PDF path', async () => {
    const { fetchImpl, calls } = recordingFetch(() => blobResponse(null));

    await fetchInvoicePdfBlob(fetchImpl, TOKEN, 'a/b c');

    assert.equal(calls[0].path, '/sws/portal/invoices/a%2Fb%20c/pdf');
  });

  it('resolves a base URL that is not the NEO one', () => {
    const baseUrl = resolvePortalBaseUrl();
    assert.equal(typeof baseUrl, 'string');
    assert.doesNotMatch(baseUrl, /\/sws\/neo/);
  });
});

describe('fetchPortalIdentity', () => {
  it('returns both names when the backend has them', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({
      businessPartnerName: '  Cliente Uno  ',
      tenantName: 'Acme SA',
    }));

    assert.deepEqual(await fetchPortalIdentity(fetchImpl, TOKEN), {
      businessPartnerName: 'Cliente Uno',
      tenantName: 'Acme SA',
      hasLogo: false,
    });
  });

  it('degrades a blank or missing name to null instead of failing', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ businessPartnerName: '   ' }));

    assert.deepEqual(await fetchPortalIdentity(fetchImpl, TOKEN), {
      businessPartnerName: null,
      tenantName: null,
      hasLogo: false,
    });
  });

  it('degrades an unparseable body to no names rather than to an error screen', async () => {
    const { fetchImpl } = recordingFetch(() => unparseableResponse());

    assert.deepEqual(await fetchPortalIdentity(fetchImpl, TOKEN), {
      businessPartnerName: null,
      tenantName: null,
      hasLogo: false,
    });
  });
});

describe('fetchPortalInvoices', () => {
  it('returns the balance and the rows in the order the backend sent them', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({
      currency: 'EUR',
      outstandingAmount: '1210.50',
      invoices: [
        { id: 'inv-1', documentNo: 'FV/0001', grandTotalAmount: 1000, outstandingAmount: 0 },
        { id: 'inv-2', documentNo: 'FV/0002', grandTotalAmount: 500, outstandingAmount: 210.5 },
      ],
    }));

    const summary = await fetchPortalInvoices(fetchImpl, TOKEN);

    assert.equal(summary.currency, 'EUR');
    assert.equal(summary.outstandingAmount, 1210.5);
    assert.deepEqual(summary.invoices.map((row) => row.documentNo), ['FV/0001', 'FV/0002']);
  });

  it('falls back to the payload currency for a row that omits it', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({
      currency: 'USD',
      invoices: [{ id: 'inv-1' }, { id: 'inv-2', currency: 'EUR' }],
    }));

    const summary = await fetchPortalInvoices(fetchImpl, TOKEN);

    assert.deepEqual(summary.invoices.map((row) => row.currency), ['USD', 'EUR']);
  });

  it('treats a payload with no invoice array as an empty list, not an error', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ outstandingAmount: 0 }));

    const summary = await fetchPortalInvoices(fetchImpl, TOKEN);

    assert.deepEqual(summary.invoices, []);
    assert.equal(summary.outstandingAmount, 0);
    assert.equal(summary.currency, null);
  });

  it('nulls an unreadable balance so the page renders a dash instead of NaN', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ outstandingAmount: 'n/a' }));

    assert.equal((await fetchPortalInvoices(fetchImpl, TOKEN)).outstandingAmount, null);
  });
});

describe('normalizePortalInvoice', () => {
  it('coerces every field to the type the table renders', () => {
    assert.deepEqual(normalizePortalInvoice({
      id: 'inv-1',
      documentNo: 'FV/0001',
      invoiceDate: '2026-08-01',
      dueDate: '2026-08-31',
      grandTotalAmount: '1000.00',
      outstandingAmount: '0',
      currency: 'EUR',
    }), {
      id: 'inv-1',
      documentNo: 'FV/0001',
      invoiceDate: '2026-08-01',
      dueDate: '2026-08-31',
      grandTotalAmount: 1000,
      outstandingAmount: 0,
      currency: 'EUR',
    });
  });

  it('nulls every absent field, including an empty-string amount', () => {
    assert.deepEqual(normalizePortalInvoice({ outstandingAmount: '' }), {
      id: null,
      documentNo: null,
      invoiceDate: null,
      dueDate: null,
      grandTotalAmount: null,
      outstandingAmount: null,
      currency: null,
    });
  });

  it('survives a missing row', () => {
    assert.equal(normalizePortalInvoice(undefined).id, null);
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

    it(`maps ${status} on /invoices to the single invalid-link code`, async () => {
      const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status }));

      await assert.rejects(
        fetchPortalInvoices(fetchImpl, TOKEN),
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

  it('maps a server error to loadFailed, not to invalid-link', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status: 500 }));

    await assert.rejects(
      fetchPortalInvoices(fetchImpl, TOKEN),
      expectPortalError(PORTAL_ERROR.loadFailed, { status: 500 }),
    );
  });
});

describe('fetchInvoicePdfBlob', () => {
  it('returns the streamed blob', async () => {
    const pdf = { size: 12, type: 'application/pdf' };
    const { fetchImpl } = recordingFetch(() => blobResponse(pdf));

    assert.equal(await fetchInvoicePdfBlob(fetchImpl, TOKEN, 'inv-1'), pdf);
  });

  it('treats a 404 as one missing document, not as a dead link', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status: 404 }));

    await assert.rejects(
      fetchInvoicePdfBlob(fetchImpl, TOKEN, 'inv-1'),
      expectPortalError(PORTAL_ERROR.downloadFailed, { status: 404 }),
    );
  });

  for (const status of [401, 403]) {
    it(`treats ${status} as a dead link, because the token itself was rejected`, async () => {
      const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status }));

      await assert.rejects(
        fetchInvoicePdfBlob(fetchImpl, TOKEN, 'inv-1'),
        expectPortalError(PORTAL_ERROR.invalidLink, { status }),
      );
    });
  }

  it('maps a server error to downloadFailed', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, { status: 500 }));

    await assert.rejects(
      fetchInvoicePdfBlob(fetchImpl, TOKEN, 'inv-1'),
      expectPortalError(PORTAL_ERROR.downloadFailed, { status: 500 }),
    );
  });

  it('maps a request that never completed to downloadFailed', async () => {
    const { fetchImpl } = failingFetch();

    await assert.rejects(
      fetchInvoicePdfBlob(fetchImpl, TOKEN, 'inv-1'),
      expectPortalError(PORTAL_ERROR.downloadFailed),
    );
  });
});
