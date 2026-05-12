import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_AUTH_RETURN_TO,
  buildAppReturnToHref,
  buildOnboardingReturnTo,
  getSafeReturnTo,
  isSafeLocalReturnTo,
} from '../oauthReturnTo.js';

test('buildOnboardingReturnTo preserves path, search, and hash', () => {
  const target = buildOnboardingReturnTo({
    pathname: '/authorize',
    search: '?client_id=opencode&scope=neo%3Aread+neo%3Awrite&state=abc',
    hash: '#step',
  });

  assert.equal(
    target,
    '/onboarding?returnTo=%2Fauthorize%3Fclient_id%3Dopencode%26scope%3Dneo%253Aread%2Bneo%253Awrite%26state%3Dabc%23step'
  );
});

test('getSafeReturnTo accepts local OAuth authorize paths', () => {
  assert.equal(
    getSafeReturnTo('?returnTo=%2Fauthorize%3Fclient_id%3Dopencode%26state%3Dabc'),
    '/authorize?client_id=opencode&state=abc'
  );
});

test('buildAppReturnToHref preserves the current app basename', () => {
  assert.equal(
    buildAppReturnToHref(
      '/authorize?client_id=opencode&state=abc',
      '/etendo/web/app-shell/onboarding'
    ),
    '/etendo/web/app-shell/authorize?client_id=opencode&state=abc'
  );
  assert.equal(
    buildAppReturnToHref('/authorize?client_id=opencode', '/onboarding'),
    '/authorize?client_id=opencode'
  );
});

test('buildAppReturnToHref falls back for unsafe targets', () => {
  assert.equal(
    buildAppReturnToHref('https://evil.example/authorize', '/etendo/web/app-shell/onboarding'),
    '/etendo/web/app-shell/dashboard'
  );
});

test('getSafeReturnTo falls back for unsafe or looping targets', () => {
  for (const search of [
    '',
    '?returnTo=https%3A%2F%2Fevil.example%2Fauthorize',
    '?returnTo=%2F%2Fevil.example%2Fauthorize',
    '?returnTo=authorize%3Fclient_id%3Dopencode',
    '?returnTo=%2Fonboarding%3FreturnTo%3D%252Fauthorize',
    '?returnTo=%2Flogin',
    '?returnTo=%2F%5Cevil',
  ]) {
    assert.equal(getSafeReturnTo(search), DEFAULT_AUTH_RETURN_TO);
  }
});

test('isSafeLocalReturnTo rejects non-local values', () => {
  assert.equal(isSafeLocalReturnTo('/authorize?state=abc'), true);
  assert.equal(isSafeLocalReturnTo('https://go.experimental.etendo.cloud/authorize'), false);
  assert.equal(isSafeLocalReturnTo('//go.experimental.etendo.cloud/authorize'), false);
  assert.equal(isSafeLocalReturnTo('/onboarding'), false);
});
