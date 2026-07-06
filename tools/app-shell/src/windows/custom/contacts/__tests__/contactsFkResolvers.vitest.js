import { describe, it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { getFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import '../contactsFkResolvers.js'; // side-effecting import: registers on load

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

  it('uses default fetchRegionCountryId when omitted and issues HTTP GET with _neoWhere', async () => {
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
      token: 'my-token',
      countryId: 'C-AR',
      apiBaseUrl: 'http://localhost/sws/neo/contacts',
      simSearchFn
    });

    assert.equal(result.status, 'auto-resolved');
    assert.equal(result.id, 'R-1');
    assert.equal(fetchMock.mock.calls.length, 1);
    const [url, init] = fetchMock.mock.calls[0];
    assert.match(url, /_neoWhere=id='R-1'/);
    assert.equal(init.headers.Authorization, 'Bearer my-token');
  });
});
