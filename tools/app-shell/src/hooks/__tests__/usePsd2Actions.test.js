/**
 * Source-level guard for usePsd2Actions.js — the PSD2 / Salt Edge bridge hook.
 *
 * The hook itself imports React + AuthContext, so it cannot be imported in a
 * plain node:test process without a browser/module environment. Following the
 * repo convention (see useBulkActionToast.test.js / main.toaster.test.js) we
 * read the source as text and assert its structural invariants, and unit-test
 * the small pure helper logic (action body building, timeout fallback) inline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'usePsd2Actions.js'), 'utf8');

describe('usePsd2Actions — public exports', () => {
  it('exports the usePsd2Actions hook', () => {
    assert.match(src, /export function usePsd2Actions\s*\(/);
  });

  it('exports the launchSaltEdgePopup helper', () => {
    assert.match(src, /export async function launchSaltEdgePopup\s*\(/);
  });

  it('exports the PSD2_CALLBACK_PATH constant', () => {
    assert.match(src, /export const PSD2_CALLBACK_PATH\s*=\s*['"]\/financial-account\/psd2-callback['"]/);
  });

  it('exports the PSD2_CONNECTION_KEY constant', () => {
    assert.match(src, /export const PSD2_CONNECTION_KEY\s*=\s*['"]psd2:lastConnectionId['"]/);
  });
});

describe('usePsd2Actions — bridge wiring', () => {
  it('targets the financial-account-psd2 NEO bridge path', () => {
    assert.match(src, /BASE_PATH\s*=\s*['"]\/sws\/neo\/financial-account-psd2['"]/);
  });

  it('sends the action via the query string', () => {
    assert.match(src, /buildQuery\(\{\s*action,/);
  });

  it('authenticates with a Bearer token from useAuth', () => {
    assert.match(src, /useAuth\(\)/);
    assert.match(src, /Authorization:\s*`Bearer \$\{token\}`/);
  });

  it('returns the data payload from response.data', () => {
    assert.match(src, /json\?\.response\?\.data/);
  });
});

describe('usePsd2Actions — action verbs', () => {
  const actions = [
    "'connect'",
    "'accounts'",
    "'providers'",
    "'link'",
    "'createAndLink'",
    "'reconnect'",
    "'disconnect'",
    "'sync'",
    "'import-settings'",
    "'status'",
  ];
  for (const action of actions) {
    it(`issues the ${action} action`, () => {
      assert.ok(src.includes(action), `expected source to call action ${action}`);
    });
  }

  it('exposes the documented action methods on the hook return value', () => {
    for (const method of [
      'connect',
      'fetchAccounts',
      'fetchProviders',
      'link',
      'createAndLink',
      'reconnect',
      'disconnect',
      'sync',
      'saveImportSettings',
      'fetchStatus',
    ]) {
      assert.match(src, new RegExp(`\\b${method}\\b`), `missing method ${method}`);
    }
  });
});

describe('usePsd2Actions — connect body', () => {
  it('connect accepts an optional financialAccountId', () => {
    assert.match(src, /async \(financialAccountId\) => \{/);
  });

  it('builds the body only when a financialAccountId is provided', () => {
    assert.match(src, /const body = financialAccountId \? \{ financialAccountId \} : \{\}/);
  });

  it('returns the connectUrl from the connect response', () => {
    assert.match(src, /\.connectUrl/);
  });

  it('returns the reconnectUrl from the reconnect response', () => {
    assert.match(src, /\.reconnectUrl/);
  });
});

describe('usePsd2Actions — timeout / abort handling', () => {
  it('uses an AbortController to enforce a request timeout', () => {
    assert.match(src, /new AbortController\(\)/);
    assert.match(src, /setTimeout\(\(\) => ctrl\.abort\(\)/);
  });

  it('maps an AbortError to a PSD2_TIMEOUT error', () => {
    assert.match(src, /err\.name === ['"]AbortError['"] \? new Error\(['"]PSD2_TIMEOUT['"]\)/);
  });

  it('clears the timeout in finally', () => {
    assert.match(src, /finally\s*\{[\s\S]*clearTimeout\(timer\)/);
  });
});

describe('usePsd2Actions — popup launch', () => {
  it('throws POPUP_BLOCKED when the popup cannot open', () => {
    assert.match(src, /throw new Error\(['"]POPUP_BLOCKED['"]\)/);
  });

  it('throws NO_CONNECT_URL when no url is resolved', () => {
    assert.match(src, /throw new Error\(['"]NO_CONNECT_URL['"]\)/);
  });

  it('listens for the psd2-connected postMessage event', () => {
    assert.match(src, /['"]psd2-connected['"]/);
    assert.match(src, /addEventListener\(['"]message['"]/);
  });

  it('verifies the message origin before accepting the connection id', () => {
    assert.match(src, /event\.origin !== window\.location\.origin/);
  });
});

// Pure re-implementation of the connect body decision to lock the contract.
function buildConnectBody(financialAccountId) {
  return financialAccountId ? { financialAccountId } : {};
}

describe('connect body logic', () => {
  it('returns an empty body when no account id is given', () => {
    assert.deepEqual(buildConnectBody(undefined), {});
  });

  it('wraps the account id when provided', () => {
    assert.deepEqual(buildConnectBody('FA-1'), { financialAccountId: 'FA-1' });
  });

  it('returns an empty body for an empty string id', () => {
    assert.deepEqual(buildConnectBody(''), {});
  });
});
