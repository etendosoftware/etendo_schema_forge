// @covers e2e/tests/helpers/auth.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeLoginFailure, watchAuthFailures } from '../auth.js';

function fakePage() {
  const listeners = new Set();
  return {
    on: (event, listener) => { if (event === 'response') listeners.add(listener); },
    off: (event, listener) => { if (event === 'response') listeners.delete(listener); },
    respond: (method, url, status) => {
      const response = { status: () => status, url: () => url, request: () => ({ method: () => method }) };
      listeners.forEach((listener) => listener(response));
    },
    listenerCount: () => listeners.size,
  };
}

describe('watchAuthFailures', () => {
  it('records the /sws/ calls refused with 401 or 403 after the login', () => {
    const page = fakePage();
    const watch = watchAuthFailures(page);

    page.respond('GET', 'http://localhost:4173/etendo/sws/go/me', 401);
    page.respond('GET', 'http://localhost:4173/etendo/sws/go/environments', 403);

    assert.deepEqual(watch.failures, [
      'GET /etendo/sws/go/me -> 401',
      'GET /etendo/sws/go/environments -> 403',
    ]);
  });

  it('ignores successful answers, other errors and calls outside /sws/', () => {
    const page = fakePage();
    const watch = watchAuthFailures(page);

    page.respond('GET', 'http://localhost:4173/etendo/sws/go/me', 200);
    page.respond('GET', 'http://localhost:4173/etendo/sws/go/environments', 500);
    page.respond('GET', 'http://localhost:4173/assets/app.js', 401);
    page.respond('GET', 'not a url', 401);

    assert.deepEqual(watch.failures, []);
  });

  it('stops listening once stopped', () => {
    const page = fakePage();
    const watch = watchAuthFailures(page);

    watch.stop();
    page.respond('GET', 'http://localhost:4173/etendo/sws/go/me', 401);

    assert.equal(page.listenerCount(), 0);
    assert.deepEqual(watch.failures, []);
  });
});

describe('describeLoginFailure', () => {
  it('names the session-lost screen and the refused calls', () => {
    const message = describeLoginFailure({
      reason: 'session-lost',
      url: 'http://localhost:4173/onboarding',
      failures: ['GET /etendo/sws/go/environments -> 401'],
    });

    assert.match(message, /"session lost" screen/);
    assert.match(message, /GET \/etendo\/sws\/go\/environments -> 401/);
  });

  it('names the last URL on a timeout and says when nothing was refused', () => {
    const message = describeLoginFailure({
      reason: 'timeout',
      url: 'http://localhost:4173/onboarding',
      failures: [],
    });

    assert.match(message, /last URL: http:\/\/localhost:4173\/onboarding/);
    assert.match(message, /No \/sws\/ call was refused/);
  });
});
