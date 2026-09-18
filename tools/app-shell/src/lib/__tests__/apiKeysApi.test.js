import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiKey, listApiKeys, revokeApiKeyTokens, rotateApiKey, updateApiKey } from '../apiKeysApi.js';

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
}

test('listApiKeys unwraps the self-service response', async () => {
  const calls = [];
  const keys = [{ id: 'key-1', name: 'Production', capabilities: ['public-api:read'] }];
  const result = await listApiKeys(async (...args) => { calls.push(args); return response({ apiKeys: keys }); });
  assert.deepEqual(result, keys);
  assert.equal(calls[0][0], '/oauth2/api-keys');
});

test('createApiKey sends only the public contract fields', async () => {
  let options;
  await createApiKey(async (_path, requestOptions) => { options = requestOptions; return response({ clientSecret: 'once' }, true, 201); }, { name: 'Read key', capabilities: ['public-api:read'] });
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(options.body), { name: 'Read key', capabilities: ['public-api:read'] });
  assert.equal(JSON.parse(options.body).adUserId, undefined);
});

test('update, rotate, and revoke use owned-key action paths', async () => {
  const paths = [];
  const apiFetch = async (path, options) => { paths.push([path, options]); return response({}); };
  await updateApiKey(apiFetch, 'key-1', { name: 'Renamed', isActive: false });
  await rotateApiKey(apiFetch, 'key-1');
  await revokeApiKeyTokens(apiFetch, 'key-1');
  assert.deepEqual(paths.map(([path]) => path), [
    '/oauth2/api-keys/key-1', '/oauth2/api-keys/key-1/rotate', '/oauth2/api-keys/key-1/revoke-tokens',
  ]);
});

test('API errors parse JSON descriptions without leaking request data', async () => {
  await assert.rejects(
    () => listApiKeys(async () => response({ error_description: 'not found', clientSecret: 'must not echo' }, false, 404)),
    /not found/,
  );
});
