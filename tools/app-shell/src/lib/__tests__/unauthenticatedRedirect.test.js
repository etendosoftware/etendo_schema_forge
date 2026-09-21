import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ONBOARDING_PATH,
  resolveUnauthenticatedRedirect,
} from '../unauthenticatedRedirect.js';

// ETP-5310 — the regression this file exists for: an unauthenticated visit to a window must
// NOT encode that window as a `returnTo`, because the next login would bounce back into it.
test('drops the returnTo for a window path so the next login lands on home', () => {
  for (const pathname of ['/product', '/sales-invoice', '/dashboard', '/account']) {
    assert.equal(
      resolveUnauthenticatedRedirect({ pathname, search: '', hash: '' }),
      ONBOARDING_PATH,
    );
  }
});

test('drops the returnTo even when the window path carries a record id, query or hash', () => {
  assert.equal(
    resolveUnauthenticatedRedirect({
      pathname: '/product/1000042',
      search: '?tab=lines',
      hash: '#totals',
    }),
    ONBOARDING_PATH,
  );
});

// The one exception. A third-party OAuth client sends the user to `/authorize?client_id=...`;
// the grant completes at that URL and nowhere else, so losing the query aborts the flow.
test('keeps the returnTo for the OAuth consent handoff', () => {
  assert.equal(
    resolveUnauthenticatedRedirect({
      pathname: '/authorize',
      search: '?client_id=opencode&state=abc',
      hash: '',
    }),
    '/onboarding?returnTo=%2Fauthorize%3Fclient_id%3Dopencode%26state%3Dabc',
  );
});

test('a path that merely starts with the authorize prefix is not eligible', () => {
  assert.equal(
    resolveUnauthenticatedRedirect({ pathname: '/authorized-signatories', search: '', hash: '' }),
    ONBOARDING_PATH,
  );
});

test('a missing or empty location falls back to onboarding', () => {
  assert.equal(resolveUnauthenticatedRedirect(undefined), ONBOARDING_PATH);
  assert.equal(resolveUnauthenticatedRedirect(null), ONBOARDING_PATH);
  assert.equal(resolveUnauthenticatedRedirect({}), ONBOARDING_PATH);
});
