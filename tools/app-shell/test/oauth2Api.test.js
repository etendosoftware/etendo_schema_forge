import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL = resolve(import.meta.dirname, '..');
const SOURCE = resolve(APP_SHELL, 'src/lib/oauth2Api.js');

describe('oauth2Api source', () => {
  it('file exists', () => {
    assert.ok(existsSync(SOURCE), 'oauth2Api.js should exist');
  });

  it('exports all expected API functions', () => {
    const src = readFileSync(SOURCE, 'utf8');
    const expected = ['listClients', 'createClient', 'updateClient', 'deleteClient', 'regenerateSecret', 'revokeTokens'];
    for (const fn of expected) {
      assert.ok(src.includes(`export async function ${fn}`), `should export ${fn}`);
    }
  });

  it('listClients calls /oauth2/clients via GET (no method override)', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("apiFetch('/oauth2/clients')"), 'listClients should call /oauth2/clients');
  });

  it('createClient sends POST to /oauth2/clients with correct body fields', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("method: 'POST'"), 'createClient should use POST');
    assert.ok(src.includes("'/oauth2/clients'"), 'createClient should target /oauth2/clients');
    assert.ok(src.includes('name, adUserId, adRoleId, scopes, isActive'), 'body should include all fields');
  });

  it('updateClient sends PUT to /oauth2/clients/:id', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("method: 'PUT'"), 'updateClient should use PUT');
    assert.ok(src.includes('`/oauth2/clients/${id}`'), 'updateClient should include id in path');
  });

  it('deleteClient sends DELETE to /oauth2/clients/:id', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("method: 'DELETE'"), 'deleteClient should use DELETE');
    assert.ok(src.includes('`/oauth2/clients/${id}`'), 'deleteClient should include id in path');
  });

  it('regenerateSecret sends PUT to /oauth2/clients/:id/regenerate-secret', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('regenerate-secret'), 'regenerateSecret should target regenerate-secret endpoint');
  });

  it('revokeTokens sends POST to /oauth2/revoke with clientId in body', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("'/oauth2/revoke'"), 'revokeTokens should target /oauth2/revoke');
    assert.ok(src.includes('clientId: id'), 'revokeTokens should send clientId in body');
  });

  it('all functions throw on non-ok responses', () => {
    const src = readFileSync(SOURCE, 'utf8');
    // Each function should check res.ok and throw
    const throwCount = (src.match(/throw new Error/g) || []).length;
    assert.ok(throwCount >= 6, `should have at least 6 error throws (one per function), got ${throwCount}`);
  });

  it('error messages include HTTP status code', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('res.status'), 'error messages should include response status');
  });
});

describe('oauth2Api runtime behaviour (mock apiFetch)', () => {
  it('listClients resolves with parsed JSON on success', async () => {
    const { listClients } = await import('../src/lib/oauth2Api.js');
    const mockData = [{ id: '1', name: 'Test Client' }];
    const apiFetch = async () => ({ ok: true, json: async () => mockData, text: async () => '' });
    const result = await listClients(apiFetch);
    assert.deepEqual(result, mockData);
  });

  it('listClients throws on non-ok response', async () => {
    const { listClients } = await import('../src/lib/oauth2Api.js');
    const apiFetch = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await assert.rejects(() => listClients(apiFetch), /Unauthorized/);
  });

  it('createClient resolves with client including clientSecret', async () => {
    const { createClient } = await import('../src/lib/oauth2Api.js');
    const created = { clientId: 'abc', clientSecret: 's3cr3t' };
    const apiFetch = async () => ({ ok: true, json: async () => created, text: async () => '' });
    const result = await createClient(apiFetch, { name: 'Agent', scopes: ['neo:read'], isActive: true });
    assert.equal(result.clientSecret, 's3cr3t');
  });

  it('createClient throws on failure', async () => {
    const { createClient } = await import('../src/lib/oauth2Api.js');
    const apiFetch = async () => ({ ok: false, status: 400, text: async () => 'Bad Request' });
    await assert.rejects(
      () => createClient(apiFetch, { name: 'Agent', scopes: [] }),
      /Bad Request/
    );
  });

  it('updateClient resolves with updated client', async () => {
    const { updateClient } = await import('../src/lib/oauth2Api.js');
    const updated = { id: '1', name: 'Updated' };
    const apiFetch = async () => ({ ok: true, json: async () => updated, text: async () => '' });
    const result = await updateClient(apiFetch, '1', { name: 'Updated', scopes: [], isActive: true });
    assert.equal(result.name, 'Updated');
  });

  it('deleteClient resolves silently on success', async () => {
    const { deleteClient } = await import('../src/lib/oauth2Api.js');
    const apiFetch = async () => ({ ok: true, text: async () => '' });
    await assert.doesNotReject(() => deleteClient(apiFetch, '1'));
  });

  it('deleteClient throws on failure', async () => {
    const { deleteClient } = await import('../src/lib/oauth2Api.js');
    const apiFetch = async () => ({ ok: false, status: 404, text: async () => 'Not Found' });
    await assert.rejects(() => deleteClient(apiFetch, 'bad-id'), /Not Found/);
  });

  it('regenerateSecret resolves with new clientSecret', async () => {
    const { regenerateSecret } = await import('../src/lib/oauth2Api.js');
    const result = { clientId: 'abc', clientSecret: 'new-secret' };
    const apiFetch = async () => ({ ok: true, json: async () => result, text: async () => '' });
    const res = await regenerateSecret(apiFetch, 'abc');
    assert.equal(res.clientSecret, 'new-secret');
  });

  it('revokeTokens resolves silently on success', async () => {
    const { revokeTokens } = await import('../src/lib/oauth2Api.js');
    const apiFetch = async () => ({ ok: true, text: async () => '' });
    await assert.doesNotReject(() => revokeTokens(apiFetch, '1'));
  });
});
