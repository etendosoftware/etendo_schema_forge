import { describe, it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { getFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
// Imported from the `sessionCredentials` leaf, not the `./auth` barrel — the
// barrel re-exports AuthContext.jsx and drags JSX into the graph.
import {
  CREDENTIAL_MODES,
  setSessionCredentials,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';
import '../contactsFkResolvers.js'; // side-effecting import: registers on load

const TEST_BEARER = 'my-token';
const TEST_CSRF = 'test-csrf';

describe('contacts-country resolver', () => {
  it('auto-resolves a single high-confidence country match', async () => {
    const resolver = getFkResolver('contacts-country');
    const simSearchFn = async () => [{ id: 'C-AR', name: 'Argentina', similarityPercent: '95', candidates: [{ id: 'C-AR', name: 'Argentina', similarityPercent: '95' }] }];
    const result = await resolver('Argentina', { token: 't', simSearchFn });
    assert.equal(result.status, 'auto-resolved');
    assert.equal(result.id, 'C-AR');
  });

  it('needs review when there is no confident match', async () => {
    const resolver = getFkResolver('contacts-country');
    const simSearchFn = async () => [null];
    const result = await resolver('Nowhereland', { token: 't', simSearchFn });
    assert.equal(result.status, 'needs-review');
  });
});

describe('contacts-region resolver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('auto-resolves a region candidate whose country matches the given countryId', async () => {
    const resolver = getFkResolver('contacts-region');
    const simSearchFn = async () => [{
      id: 'R-1', name: 'Córdoba', similarityPercent: '95',
      candidates: [{ id: 'R-1', name: 'Córdoba', similarityPercent: '95' }],
    }];
    const fetchRegionCountryId = async (regionId) => (regionId === 'R-1' ? 'C-AR' : 'C-ES');
    const result = await resolver('Córdoba', { token: 't', countryId: 'C-AR', simSearchFn, fetchRegionCountryId });
    assert.equal(result.status, 'auto-resolved');
    assert.equal(result.id, 'R-1');
  });

  it('needs review when every candidate belongs to a different country', async () => {
    const resolver = getFkResolver('contacts-region');
    const simSearchFn = async () => [{
      id: 'R-2', name: 'Córdoba', similarityPercent: '95',
      candidates: [{ id: 'R-2', name: 'Córdoba', similarityPercent: '95' }],
    }];
    const fetchRegionCountryId = async () => 'C-ES';
    const result = await resolver('Córdoba', { token: 't', countryId: 'C-AR', simSearchFn, fetchRegionCountryId });
    assert.equal(result.status, 'needs-review');
  });

  /**
   * ETP-4576. The default lookup used to require a `token` and hand-build
   * `Authorization: Bearer`. Both schemes are asserted because the cookie case
   * is the regression: with no token held, the old `!token` guard returned
   * `null` for every candidate, the country filter then discarded all of them,
   * and a valid region surfaced as "needs review" — no error, no request, just
   * a row the user had to fix by hand.
   */
  for (const scheme of [
    {
      name: 'bearer',
      declare: () => setSessionCredentials({
        mode: CREDENTIAL_MODES.bearer, token: TEST_BEARER, csrfToken: TEST_CSRF,
      }),
      assertCredential: (headers) => {
        assert.equal(headers.Authorization, `Bearer ${TEST_BEARER}`);
      },
    },
    {
      name: 'cookie',
      declare: () => setSessionCredentials({
        mode: CREDENTIAL_MODES.cookie, token: TEST_BEARER, csrfToken: TEST_CSRF,
      }),
      assertCredential: (headers) => {
        assert.equal(headers.Authorization, undefined,
          'the cookie scheme must not send a bearer');
        assert.equal(headers['X-Go-CSRF'], undefined,
          'a GET carries no CSRF proof');
      },
    },
  ]) {
    it(`uses default fetchRegionCountryId under the ${scheme.name} scheme and issues HTTP GET with _neoWhere`, async () => {
      scheme.declare();
      const resolver = getFkResolver('contacts-region');
      const simSearchFn = async () => [{
        id: 'R-1', name: 'Córdoba', similarityPercent: '95',
        candidates: [{ id: 'R-1', name: 'Córdoba', similarityPercent: '95' }],
      }];

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            data: [{ id: 'R-1', country: 'C-AR' }]
          }
        })
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await resolver('Córdoba', {
        countryId: 'C-AR',
        apiBaseUrl: 'http://localhost/sws/neo/contacts',
        simSearchFn
      });

      assert.equal(result.status, 'auto-resolved');
      assert.equal(result.id, 'R-1');
      assert.equal(fetchMock.mock.calls.length, 1,
        'the lookup must be issued regardless of which scheme carries the session');
      const [url, init] = fetchMock.mock.calls[0];
      // The where clause is URL-encoded before being embedded in the query string.
      assert.match(url, /_neoWhere=id%3D'R-1'/);
      assert.equal(init.credentials, 'include');
      // A bodyless GET must not declare a Content-Type: it is not a
      // CORS-safelisted value and would force a preflight on every call.
      assert.equal(init.headers['Content-Type'], undefined);
      scheme.assertCredential(init.headers);
    });
  }
});
