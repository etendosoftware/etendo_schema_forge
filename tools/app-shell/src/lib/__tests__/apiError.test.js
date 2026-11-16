// @covers tools/app-shell/src/lib/apiError.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractApiErrorMessage } from '../apiError.js';

// ---------------------------------------------------------------------------
// Helpers — fake Response objects (no DOM/fetch needed)
// ---------------------------------------------------------------------------

function makeRes(status, body) {
  return {
    status,
    json: async () => body,
  };
}

function makeNonJsonRes(status) {
  return {
    status,
    json: async () => { throw new SyntaxError('Unexpected token'); },
  };
}

// ---------------------------------------------------------------------------
// extractApiErrorMessage (ETP-3660)
// ---------------------------------------------------------------------------

describe('extractApiErrorMessage — error shape parsing (ETP-3660)', () => {
  describe('NEO Headless format: { error: { message } }', () => {
    it('returns error.message from top-level error object', async () => {
      const res = makeRes(400, { error: { message: 'Cannot delete' } });
      assert.equal(await extractApiErrorMessage(res), 'Cannot delete');
    });

    it('prefers error.message over other keys when both present', async () => {
      const res = makeRes(400, { error: { message: 'NEO error' }, message: 'Top-level fallback' });
      assert.equal(await extractApiErrorMessage(res), 'NEO error');
    });
  });

  describe('Etendo format: { response: { error: { message } } }', () => {
    it('returns response.error.message', async () => {
      const res = makeRes(500, { response: { error: { message: 'FK violation' } } });
      assert.equal(await extractApiErrorMessage(res), 'FK violation');
    });

    it('returns response.error.message even when top-level error is absent', async () => {
      const res = makeRes(422, { response: { error: { message: 'Validation failed' } } });
      assert.equal(await extractApiErrorMessage(res), 'Validation failed');
    });
  });

  describe('Etendo format: { response: { error: string } }', () => {
    it('returns the string directly when response.error is a string', async () => {
      const res = makeRes(400, { response: { error: 'Bad request' } });
      assert.equal(await extractApiErrorMessage(res), 'Bad request');
    });

    it('returns empty string when response.error is an empty string (typeof check passes)', async () => {
      // typeof '' === 'string' is true, so the function returns '' directly
      const res = makeRes(400, { response: { error: '' } });
      assert.equal(await extractApiErrorMessage(res), '');
    });
  });

  describe('Top-level message fallback: { message }', () => {
    it('returns data.message when no nested error is found', async () => {
      const res = makeRes(503, { message: 'Something went wrong' });
      assert.equal(await extractApiErrorMessage(res), 'Something went wrong');
    });

    it('returns data.message even with an empty response object', async () => {
      const res = makeRes(500, { message: 'Internal error' });
      assert.equal(await extractApiErrorMessage(res), 'Internal error');
    });
  });

  describe('Non-JSON body — falls back to status code', () => {
    it('returns Error <status> when res.json() throws', async () => {
      const res = makeNonJsonRes(500);
      assert.equal(await extractApiErrorMessage(res), 'Error 500');
    });

    it('uses the actual status in the fallback message', async () => {
      const res = makeNonJsonRes(404);
      assert.equal(await extractApiErrorMessage(res), 'Error 404');
    });

    it('handles 503 status in fallback', async () => {
      const res = makeNonJsonRes(503);
      assert.equal(await extractApiErrorMessage(res), 'Error 503');
    });
  });

  describe('Empty JSON body — falls back to status code', () => {
    it('returns Error <status> for empty object {}', async () => {
      const res = makeRes(422, {});
      assert.equal(await extractApiErrorMessage(res), 'Error 422');
    });

    it('returns Error <status> for null data (json returns null)', async () => {
      const res = makeRes(400, null);
      assert.equal(await extractApiErrorMessage(res), 'Error 400');
    });
  });

  describe('Priority ordering', () => {
    it('error.message takes priority over response.error.message', async () => {
      const res = makeRes(400, {
        error: { message: 'Top-level wins' },
        response: { error: { message: 'Nested loses' } },
      });
      assert.equal(await extractApiErrorMessage(res), 'Top-level wins');
    });

    it('response.error.message takes priority over data.message', async () => {
      const res = makeRes(400, {
        response: { error: { message: 'Nested wins' } },
        message: 'Top-level loses',
      });
      assert.equal(await extractApiErrorMessage(res), 'Nested wins');
    });

    it('data.message takes priority over status fallback', async () => {
      const res = makeRes(404, { message: 'Not found description' });
      assert.equal(await extractApiErrorMessage(res), 'Not found description');
    });
  });
});

describe('extractApiErrorMessage — backend-error translation with `t`', () => {
  const t = (key) => (key === 'backendError.accessDeniedToSpec' ? 'translated: no access' : key);

  it('translates the access-denied message when t is given', async () => {
    const res = makeRes(403, { error: { message: 'Access denied to spec for current role' } });
    assert.equal(await extractApiErrorMessage(res, t), 'translated: no access');
  });

  it('keeps the raw message when t is omitted', async () => {
    const res = makeRes(403, { error: { message: 'Access denied to spec for current role' } });
    assert.equal(await extractApiErrorMessage(res), 'Access denied to spec for current role');
  });

  it('falls back to Error <status> on a non-JSON body even with t', async () => {
    assert.equal(await extractApiErrorMessage(makeNonJsonRes(403), t), 'Error 403');
  });
});
