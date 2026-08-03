import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADE_ERROR_CODES,
  getPlatformToken,
  readNdjsonStream,
  createProductiveTenant,
} from '../upgrade/api.js';

/**
 * Upgrade API — paid tenant creation (ETP-4686).
 *
 * The two behaviours that make this module exist rather than reusing the core
 * `runOnboardingStream` helper are asserted directly: `paymentToken` reaches the
 * wire, and a 402 is recognised before the response body is touched.
 */

const FORM = {
  clientName: 'Acme Productive',
  currency: 'EUR',
  language: 'es_ES',
  countryCode: 'ES',
  paymentToken: 'mock-paid-abc123',
};

/** A reader that hands back the given chunks, then reports done. */
function readerOf(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: async () => {
      if (index >= chunks.length) return { done: true, value: undefined };
      const value = encoder.encode(chunks[index]);
      index += 1;
      return { done: false, value };
    },
  };
}

function ndjsonResponse(chunks) {
  return { ok: true, status: 200, body: { getReader: () => readerOf(chunks) } };
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

/** Records every call so the request can be asserted. */
function recordingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : response;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const progress = (step, status = 'done') => JSON.stringify({ type: 'progress', step, status });
const result = (success = true) => JSON.stringify({ type: 'result', success });

describe('getPlatformToken', () => {
  it('reads the account-level token', () => {
    assert.equal(getPlatformToken({ getItem: key => (key === 'sf_platform_token' ? 'tok' : null) }), 'tok');
  });

  it('returns null when the token is absent or empty', () => {
    assert.equal(getPlatformToken({ getItem: () => null }), null);
    assert.equal(getPlatformToken({ getItem: () => '' }), null);
  });

  it('returns null when storage is unavailable or throws', () => {
    assert.equal(getPlatformToken(undefined), null);
    assert.equal(getPlatformToken({ getItem: () => { throw new Error('blocked'); } }), null);
  });
});

describe('readNdjsonStream', () => {
  it('forwards every message and returns the final result', async () => {
    const seen = [];
    const final = await readNdjsonStream(
      readerOf([`${progress('setup')}\n${progress('client')}\n${result()}\n`]),
      message => seen.push(message)
    );

    assert.equal(seen.length, 3);
    assert.deepEqual(seen.map(m => m.type), ['progress', 'progress', 'result']);
    assert.deepEqual(final, { type: 'result', success: true });
  });

  it('reassembles a message split across chunk boundaries', async () => {
    const line = result();
    const final = await readNdjsonStream(
      readerOf([line.slice(0, 7), line.slice(7, 15), `${line.slice(15)}\n`])
    );
    assert.deepEqual(final, { type: 'result', success: true });
  });

  it('reads a final line that arrives without a trailing newline', async () => {
    const final = await readNdjsonStream(readerOf([`${progress('setup')}\n${result()}`]));
    assert.deepEqual(final, { type: 'result', success: true });
  });

  it('skips blank and malformed lines instead of aborting the run', async () => {
    const seen = [];
    const final = await readNdjsonStream(
      readerOf([`${progress('setup')}\n\n   \nnot json at all\n${result()}\n`]),
      message => seen.push(message)
    );

    assert.equal(seen.length, 2);
    assert.deepEqual(final, { type: 'result', success: true });
  });

  it('keeps the last result when several arrive', async () => {
    const final = await readNdjsonStream(readerOf([`${result(true)}\n${result(false)}\n`]));
    assert.deepEqual(final, { type: 'result', success: false });
  });

  it('returns null for a stream that carries no result', async () => {
    assert.equal(await readNdjsonStream(readerOf([`${progress('setup')}\n`])), null);
  });

  it('returns null for an empty stream', async () => {
    assert.equal(await readNdjsonStream(readerOf([])), null);
  });

  it('tolerates a missing onMessage callback', async () => {
    assert.deepEqual(await readNdjsonStream(readerOf([`${result()}\n`])), { type: 'result', success: true });
  });
});

describe('createProductiveTenant — the request', () => {
  it('posts to the onboarding endpoint with the payment token included', async () => {
    const fetchImpl = recordingFetch(ndjsonResponse([`${result()}\n`]));
    await createProductiveTenant(fetchImpl, 'https://api.test', 'platform-token', FORM);

    const [call] = fetchImpl.calls;
    assert.equal(call.url, 'https://api.test/sws/go/onboarding');
    assert.equal(call.init.method, 'POST');
    // The core helper serialises a fixed allowlist that drops paymentToken —
    // this is the reason this module exists.
    assert.deepEqual(JSON.parse(call.init.body), {
      clientName: 'Acme Productive',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      paymentToken: 'mock-paid-abc123',
    });
  });

  it('authenticates with the token it is given', async () => {
    const fetchImpl = recordingFetch(ndjsonResponse([`${result()}\n`]));
    await createProductiveTenant(fetchImpl, '', 'platform-token', FORM);
    assert.match(JSON.stringify(fetchImpl.calls[0].init.headers), /platform-token/);
  });

  it('supports an empty base URL, as the app uses in production', async () => {
    const fetchImpl = recordingFetch(ndjsonResponse([`${result()}\n`]));
    await createProductiveTenant(fetchImpl, '', 'platform-token', FORM);
    assert.equal(fetchImpl.calls[0].url, '/sws/go/onboarding');
  });
});

describe('createProductiveTenant — the response', () => {
  it('streams progress messages through to the caller', async () => {
    const seen = [];
    const fetchImpl = recordingFetch(ndjsonResponse([`${progress('setup')}\n${progress('client')}\n${result()}\n`]));

    const final = await createProductiveTenant(fetchImpl, '', 'tok', FORM, m => seen.push(m));

    assert.deepEqual(seen.map(m => m.step).filter(Boolean), ['setup', 'client']);
    assert.equal(final.success, true);
  });

  it('raises a payment error on 402 without touching the body', async () => {
    let bodyRead = false;
    const fetchImpl = recordingFetch({
      ok: false,
      status: 402,
      json: async () => ({ error: 'payment_required', message: 'Payment is required' }),
      get body() {
        bodyRead = true;
        return undefined;
      },
    });

    await assert.rejects(
      () => createProductiveTenant(fetchImpl, '', 'tok', FORM),
      error => {
        assert.equal(error.code, UPGRADE_ERROR_CODES.paymentRequired);
        assert.equal(error.status, 402);
        assert.equal(error.message, 'Payment is required');
        return true;
      }
    );
    // The paywall answers before provisioning starts, so there is no stream.
    assert.equal(bodyRead, false);
  });

  it('still raises a payment error when the 402 body is unreadable', async () => {
    const fetchImpl = recordingFetch({
      ok: false,
      status: 402,
      json: async () => { throw new Error('not json'); },
    });
    await assert.rejects(
      () => createProductiveTenant(fetchImpl, '', 'tok', FORM),
      error => error.code === UPGRADE_ERROR_CODES.paymentRequired
    );
  });

  it('raises a generic failure for any other error status', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ error: { message: 'boom' } }, { ok: false, status: 500 }));
    await assert.rejects(
      () => createProductiveTenant(fetchImpl, '', 'tok', FORM),
      error => {
        assert.equal(error.code, UPGRADE_ERROR_CODES.failed);
        assert.equal(error.status, 500);
        assert.equal(error.message, 'boom');
        return true;
      }
    );
  });

  it('raises a stream error when the response carries no readable body', async () => {
    const fetchImpl = recordingFetch({ ok: true, status: 200 });
    await assert.rejects(
      () => createProductiveTenant(fetchImpl, '', 'tok', FORM),
      error => error.code === UPGRADE_ERROR_CODES.streamUnavailable
    );
  });

  it('raises a missing-result error when the stream ends without one', async () => {
    const fetchImpl = recordingFetch(ndjsonResponse([`${progress('setup')}\n`]));
    await assert.rejects(
      () => createProductiveTenant(fetchImpl, '', 'tok', FORM),
      error => error.code === UPGRADE_ERROR_CODES.missingResult
    );
  });

  it('returns an unsuccessful result rather than raising — the page decides', async () => {
    const fetchImpl = recordingFetch(ndjsonResponse([`${result(false)}\n`]));
    const final = await createProductiveTenant(fetchImpl, '', 'tok', FORM);
    assert.equal(final.success, false);
  });
});
