// @covers scripts/public-api-e2e-ci.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  childEnv, CookieJar, FULL_CAPABILITIES, READONLY_CAPABILITIES, keyName, leftoverKeys, runTimeoutMinutes, pickEnvironment, pinnedCoreVersion, reporterNodeOptions, resolveCredentials,
  resolveNeoBaseUrl, retryOn401, setCookiePairs,
} from '../public-api-e2e-ci.mjs';

const headersWith = (cookies) => {
  const headers = new Headers();
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return headers;
};

describe('public-api-e2e-ci helpers', () => {
  describe('key capabilities', () => {
    it('gives the full key read, write and process (business actions), the other key read only', () => {
      assert.deepEqual(FULL_CAPABILITIES, ['public-api:read', 'public-api:write', 'public-api:process']);
      assert.deepEqual(READONLY_CAPABILITIES, ['public-api:read']);
    });
  });

  describe('retryOn401', () => {
    const scripted = (...statuses) => {
      const calls = { count: 0 };
      const send = async () => ({ status: statuses[Math.min(calls.count++, statuses.length - 1)] });
      return { send, calls };
    };
    const noSleep = { sleep: async () => {} };

    it('retries a 401 and returns the first success', async () => {
      const { send, calls } = scripted(401, 200);
      assert.equal((await retryOn401(send, noSleep)).status, 200);
      assert.equal(calls.count, 2);
    });
    it('returns the last 401 after the retry cap', async () => {
      const { send, calls } = scripted(401);
      const waits = [];
      const res = await retryOn401(send, { sleep: async (ms) => { waits.push(ms); } });
      assert.equal(res.status, 401);
      assert.equal(calls.count, 4);
      assert.deepEqual(waits, [500, 500, 500]);
    });
    it('does not retry any other status', async () => {
      for (const status of [200, 403, 500]) {
        const { send, calls } = scripted(status, 200);
        assert.equal((await retryOn401(send, noSleep)).status, status);
        assert.equal(calls.count, 1);
      }
    });
    it('does not retry a thrown error', async () => {
      let count = 0;
      await assert.rejects(retryOn401(async () => { count += 1; throw new Error('boom'); }, noSleep), /boom/);
      assert.equal(count, 1);
    });
  });

  describe('pinnedCoreVersion', () => {
    it('returns the exact pin', () => {
      assert.equal(pinnedCoreVersion({ dependencies: { '@etendosoftware/schema-forge-core': '0.3.95' } }), '0.3.95');
    });
    it('refuses a range or a missing pin: there is no single tag to build from', () => {
      assert.throws(() => pinnedCoreVersion({ dependencies: { '@etendosoftware/schema-forge-core': '^0.3.95' } }), /exact x\.y\.z/);
      assert.throws(() => pinnedCoreVersion({}), /exact x\.y\.z/);
    });
  });

  describe('resolveCredentials', () => {
    it('prefers the explicit email/password pair', () => {
      assert.deepEqual(resolveCredentials({ PUBLIC_API_E2E_EMAIL: ' a@b.c ', PUBLIC_API_E2E_PASSWORD: 'p' }), { email: 'a@b.c', password: 'p' });
    });
    it('requires the password when the email is given', () => {
      assert.throws(() => resolveCredentials({ PUBLIC_API_E2E_EMAIL: 'a@b.c' }), /PUBLIC_API_E2E_PASSWORD/);
    });
    it('reads the onboarding credentials file', () => {
      const read = () => JSON.stringify({ email: 'e2e@x.test', password: 'pw' });
      assert.deepEqual(resolveCredentials({ PUBLIC_API_E2E_CREDENTIALS_FILE: 'f.json' }, read), { email: 'e2e@x.test', password: 'pw' });
    });
    it('names the file but never its content when it is unusable', () => {
      assert.throws(() => resolveCredentials({ PUBLIC_API_E2E_CREDENTIALS_FILE: 'f.json' }, () => '{"email":"x"}'), /f\.json has no email\/password/);
      assert.throws(() => resolveCredentials({ PUBLIC_API_E2E_CREDENTIALS_FILE: 'f.json' }, () => 'not json'), /Cannot read the credentials file f\.json/);
    });
    it('fails with the accepted variables when nothing is configured', () => {
      assert.throws(() => resolveCredentials({}), /PUBLIC_API_E2E_CREDENTIALS_FILE/);
    });
  });

  describe('resolveNeoBaseUrl', () => {
    it('defaults to the local Tomcat and trims the trailing slash', () => {
      assert.equal(resolveNeoBaseUrl({}), 'http://localhost:8080/etendo');
      assert.equal(resolveNeoBaseUrl({ NEO_BASE_URL: 'http://127.0.0.1:8081/go/' }), 'http://127.0.0.1:8081/go');
    });
    it('refuses a remote NEO unless explicitly allowed', () => {
      assert.throws(() => resolveNeoBaseUrl({ NEO_BASE_URL: 'https://erp.example.com/etendo' }), /Refusing/);
      assert.equal(resolveNeoBaseUrl({ NEO_BASE_URL: 'https://erp.example.com/etendo', PUBLIC_API_E2E_ALLOW_REMOTE: '1' }), 'https://erp.example.com/etendo');
    });
  });

  describe('cookies', () => {
    it('keeps only name=value of every Set-Cookie', () => {
      const pairs = setCookiePairs(headersWith(['__Host-go_session=s1; Secure; HttpOnly; Path=/', '__Host-go_refresh=r=1; Path=/']));
      assert.deepEqual(pairs, [['__Host-go_session', 's1'], ['__Host-go_refresh', 'r=1']]);
    });
    it('splits a folded header on runtimes without getSetCookie', () => {
      const folded = { get: () => 'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, b=2; Path=/' };
      assert.deepEqual(setCookiePairs(folded), [['a', '1'], ['b', '2']]);
    });
    it('replaces a rotated session cookie and drops an expired one', () => {
      const jar = new CookieJar();
      jar.update(headersWith(['__Host-go_session=s1; Path=/', '__Host-go_refresh=r1; Path=/']));
      jar.update(headersWith(['__Host-go_session=s2; Path=/', '__Host-go_refresh=; Path=/; Max-Age=0']));
      assert.equal(jar.header(), '__Host-go_session=s2');
    });
  });

  describe('pickEnvironment', () => {
    it('enters the first environment with an admin user, as the SPA does after login', () => {
      const chosen = pickEnvironment({ environments: [{ clientName: 'no user' }, { adminUserId: 'U1', orgId: 'O1' }, { adminUserId: 'U2' }] });
      assert.equal(chosen.adminUserId, 'U1');
    });
    it('prefers the tenant the account owns over one it was invited into', () => {
      const chosen = pickEnvironment({ environments: [
        { adminUserId: 'U1', relationship: 'INVITED' },
        { adminUserId: 'U2', relationship: 'OWNER' },
      ] });
      assert.equal(chosen.adminUserId, 'U2');
    });
    it('fails clearly when the account has none', () => {
      assert.throws(() => pickEnvironment({ environments: [] }), /no environment/);
      assert.throws(() => pickEnvironment(undefined), /no environment/);
    });
  });

  it('keyName is per run and within the 120-character limit', () => {
    assert.equal(keyName('abc', 'full'), 'e2e-ci-abc-full');
    assert.equal(keyName('x'.repeat(200), 'full').length, 120);
  });

  describe('reporterNodeOptions', () => {
    it('adds spec + JUnit reporters after the existing options', () => {
      assert.equal(
        reporterNodeOptions('--max-old-space-size=4096', '/r/junit.xml'),
        '--max-old-space-size=4096 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=/r/junit.xml',
      );
    });
    it('leaves the options alone without a JUnit destination', () => {
      assert.equal(reporterNodeOptions(undefined, undefined), '');
      assert.equal(reporterNodeOptions(' --foo ', undefined), '--foo');
    });
  });

  describe('childEnv', () => {
    it('keeps the allowlist and the extras, drops everything else', () => {
      const env = {
        PATH: '/bin', HOME: '/h', NODE_ENV: 'test', npm_config_cache: '/c', PUBLIC_API_RATE_LIMIT: '5',
        GITHUB_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', SONAR_TOKEN: 'secret',
      };
      assert.deepEqual(childEnv(env, { GATEWAY_PORT: '1234', PUBLIC_API_RATE_LIMIT: '100000' }), {
        PATH: '/bin', HOME: '/h', NODE_ENV: 'test', npm_config_cache: '/c', PUBLIC_API_RATE_LIMIT: '100000', GATEWAY_PORT: '1234',
      });
    });
    it('never hands on the account this script signs in with', () => {
      const env = { PUBLIC_API_E2E_EMAIL: 'a@b.c', PUBLIC_API_E2E_PASSWORD: 'pw', PUBLIC_API_E2E_CREDENTIALS_FILE: 'f', PUBLIC_API_E2E_JUNIT: '0' };
      assert.deepEqual(childEnv(env), { PUBLIC_API_E2E_JUNIT: '0' });
    });
  });

  describe('leftoverKeys', () => {
    const body = { apiKeys: [
      { id: '1', name: 'e2e-ci-old-full', isActive: true },
      { id: '2', name: 'e2e-ci-now-full', isActive: true },
      { id: '3', name: 'e2e-ci-old-readonly', isActive: false },
      { id: '4', name: 'Production integration', isActive: true },
    ] };
    it('selects active e2e-ci-* keys of other runs only', () => {
      assert.deepEqual(leftoverKeys(body, 'now').map((key) => key.id), ['1']);
    });
    it('tolerates an unexpected body', () => {
      assert.deepEqual(leftoverKeys(undefined, 'now'), []);
    });
  });

  describe('edge cases', () => {
    const CORE = '@etendosoftware/schema-forge-core';

    it('pinnedCoreVersion: falls back to devDependencies, refuses pre-release, v prefix and null', () => {
      assert.equal(pinnedCoreVersion({ devDependencies: { [CORE]: '1.2.3' } }), '1.2.3');
      assert.throws(() => pinnedCoreVersion({ dependencies: { [CORE]: '0.3.95-rc.1' } }), /exact x\.y\.z/);
      assert.throws(() => pinnedCoreVersion({ dependencies: { [CORE]: 'v0.3.95' } }), /exact x\.y\.z/);
      assert.throws(() => pinnedCoreVersion(null), /exact x\.y\.z/);
    });

    it('resolveCredentials: a blank email falls back to the file, a real one wins over it', () => {
      const read = () => JSON.stringify({ email: 'file@x.test', password: 'pw' });
      assert.deepEqual(resolveCredentials({ PUBLIC_API_E2E_EMAIL: '   ', PUBLIC_API_E2E_CREDENTIALS_FILE: 'f.json' }, read), { email: 'file@x.test', password: 'pw' });
      assert.deepEqual(
        resolveCredentials({ PUBLIC_API_E2E_EMAIL: 'env@x.test', PUBLIC_API_E2E_PASSWORD: 'p2', PUBLIC_API_E2E_CREDENTIALS_FILE: 'f.json' }, read),
        { email: 'env@x.test', password: 'p2' },
      );
    });
    it('resolveCredentials: a non-string password in the file is refused', () => {
      assert.throws(() => resolveCredentials({ PUBLIC_API_E2E_CREDENTIALS_FILE: 'f.json' }, () => '{"email":"a@b.c","password":12345}'), /no email\/password/);
    });

    it('resolveNeoBaseUrl: invalid URL, the local hosts, look-alike and truthy-but-not-1 overrides', () => {
      assert.throws(() => resolveNeoBaseUrl({ NEO_BASE_URL: 'not a url' }), /not a valid URL/);
      for (const host of ['localhost', '127.0.0.1', '[::1]']) {
        assert.equal(resolveNeoBaseUrl({ NEO_BASE_URL: `http://${host}:8080/etendo` }), `http://${host}:8080/etendo`);
      }
      assert.throws(() => resolveNeoBaseUrl({ NEO_BASE_URL: 'http://localhost.evil.com/etendo' }), /Refusing/);
      assert.throws(() => resolveNeoBaseUrl({ NEO_BASE_URL: 'https://erp.example.com', PUBLIC_API_E2E_ALLOW_REMOTE: 'true' }), /Refusing/);
      assert.equal(resolveNeoBaseUrl({ NEO_BASE_URL: '  ' }), 'http://localhost:8080/etendo');
    });

    it('cookies: no header, an empty one and a pair without = leave the jar empty', () => {
      assert.deepEqual(setCookiePairs(new Headers()), []);
      assert.deepEqual(setCookiePairs({ get: () => null }), []);
      assert.deepEqual(setCookiePairs({ get: () => '' }), []);
      assert.deepEqual(setCookiePairs(headersWith(['garbage; Path=/'])), []);
      const jar = new CookieJar();
      jar.update(headersWith(['garbage; Path=/']));
      assert.equal(jar.size, 0);
      assert.equal(jar.header(), '');
      jar.update(headersWith(['a=1', 'b=2']));
      assert.equal(jar.size, 2);
    });

    it('pickEnvironment: an OWNER without adminUserId is skipped, odd bodies fail clearly', () => {
      const chosen = pickEnvironment({ environments: [{ relationship: 'OWNER' }, { adminUserId: 'U2', relationship: 'INVITED' }] });
      assert.equal(chosen.adminUserId, 'U2');
      assert.throws(() => pickEnvironment({}), /no environment/);
      assert.throws(() => pickEnvironment({ environments: { adminUserId: 'U1' } }), /no environment/);
    });

    it('leftoverKeys: missing isActive counts as active, malformed entries are ignored', () => {
      const body = { apiKeys: [
        { id: '1', name: 'e2e-ci-old-full' },
        { name: 'e2e-ci-old-readonly', isActive: true },
        { id: '3', name: 42, isActive: true },
        null,
      ] };
      assert.deepEqual(leftoverKeys(body, 'now').map((key) => key.id), ['1']);
    });
    it('leftoverKeys: a run whose id merely starts with this run id is another run', () => {
      const body = { apiKeys: [
        { id: 'own', name: 'e2e-ci-abc-full', isActive: true },
        { id: 'other', name: 'e2e-ci-abcd-full', isActive: true },
      ] };
      assert.deepEqual(leftoverKeys(body, 'abc').map((key) => key.id), ['other']);
    });

    it('childEnv: drops undefined values, keeps NPM_CONFIG_ in either case, extras override NODE_OPTIONS', () => {
      const env = { PATH: '/bin', HOME: undefined, NPM_CONFIG_CACHE: '/c', NODE_OPTIONS: '--inspect' };
      assert.deepEqual(childEnv(env, { NODE_OPTIONS: '' }), { PATH: '/bin', NPM_CONFIG_CACHE: '/c', NODE_OPTIONS: '' });
    });

    it('runTimeoutMinutes: 30 by default, a positive number when set, anything else refused', () => {
      assert.equal(runTimeoutMinutes({}), 30);
      assert.equal(runTimeoutMinutes({ PUBLIC_API_E2E_TIMEOUT_MINUTES: ' 12.5 ' }), 12.5);
      for (const raw of ['0', '-3', 'soon']) {
        assert.throws(() => runTimeoutMinutes({ PUBLIC_API_E2E_TIMEOUT_MINUTES: raw }), /positive number/);
      }
    });
  });
});
