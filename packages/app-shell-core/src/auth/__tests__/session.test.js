import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAuthStorage, createMemoryAuthStorage, normalizeAuthSession } from '../session.js';

function createFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    keys: () => [...data.keys()],
  };
}

test('normalizeAuthSession exposes the standalone auth contract shape', () => {
  assert.deepEqual(normalizeAuthSession({ token: 't', username: 'u' }), {
    token: 't',
    username: 'u',
    clientId: null,
    roleList: [],
    selectedRole: null,
    selectedOrg: null,
  });
});

test('memory auth storage supports SDK consumers without browser localStorage', () => {
  const storage = createMemoryAuthStorage({ token: 'initial' });
  assert.equal(storage.read().token, 'initial');

  storage.write({ token: 'next', roleList: [{ id: 'admin' }] });
  assert.deepEqual(storage.read(), {
    token: 'next',
    username: null,
    clientId: null,
    roleList: [{ id: 'admin' }],
    selectedRole: null,
    selectedOrg: null,
  });

  storage.clear();
  assert.equal(storage.read().token, null);
});

test('local auth storage round-trips a session through prefixed keys', () => {
  const backing = createFakeStorage();
  const storage = createLocalAuthStorage({ storage: backing });

  storage.write({
    token: 't',
    username: 'u',
    roleList: [{ id: 'admin' }],
    selectedRole: { id: 'admin' },
    selectedOrg: { id: 'org' },
  });

  assert.deepEqual(storage.read(), {
    token: 't',
    username: 'u',
    clientId: null,
    roleList: [{ id: 'admin' }],
    selectedRole: { id: 'admin' },
    selectedOrg: { id: 'org' },
  });
});

test('local auth storage clear removes session keys and both platform keys', () => {
  const backing = createFakeStorage({
    sf_platform_token: 'platform-token',
    sf_platform_auth_method: 'password',
    unrelated_key: 'kept',
  });
  const storage = createLocalAuthStorage({ storage: backing });
  storage.write({ token: 't', username: 'u', roleList: [{ id: 'admin' }] });

  storage.clear();

  assert.equal(backing.getItem('sf_auth_token'), null);
  assert.equal(backing.getItem('sf_auth_user'), null);
  assert.equal(backing.getItem('sf_auth_rolelist'), null);
  assert.equal(backing.getItem('sf_platform_token'), null);
  assert.equal(backing.getItem('sf_platform_auth_method'), null);
  assert.equal(backing.getItem('unrelated_key'), 'kept');
  assert.deepEqual(storage.read(), normalizeAuthSession());
});

test('local auth storage clear is a no-op without a storage backend', () => {
  const storage = createLocalAuthStorage({ storage: null });
  assert.doesNotThrow(() => storage.clear());
  assert.deepEqual(storage.read(), normalizeAuthSession());
});
