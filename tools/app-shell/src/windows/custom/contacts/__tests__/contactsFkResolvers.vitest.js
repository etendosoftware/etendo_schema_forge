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

