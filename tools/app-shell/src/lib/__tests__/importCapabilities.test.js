// @covers tools/app-shell/src/lib/importCapabilities.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasImportCapability,
  publishImportCapabilities,
  resetImportCapabilitiesForTests,
} from '../importCapabilities.js';

// The store a plain import descriptor reads the session capabilities from. The hook wiring that
// feeds it (useWindowImportDialog) is covered in ListView.importLabels.vitest.jsx; this file
// guards the store itself: it fails closed and only a strict `true` turns a capability on.

const KEY = 'structuredAddressForSepa';

describe('importCapabilities', () => {
  beforeEach(() => {
    resetImportCapabilitiesForTests();
  });

  it('reports every capability off before anything is published', () => {
    assert.equal(hasImportCapability(KEY), false);
  });

  describe('only a strict true turns a capability on', () => {
    const cases = [
      { value: true, expected: true },
      { value: false, expected: false },
      { value: 'true', expected: false },
      { value: 1, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];
    for (const { value, expected } of cases) {
      it(`${JSON.stringify(value) ?? 'undefined'} -> ${expected}`, () => {
        publishImportCapabilities({ [KEY]: value });
        assert.equal(hasImportCapability(KEY), expected);
      });
    }

    it('keeps a key that is missing from the published map off', () => {
      publishImportCapabilities({ otherCapability: true });
      assert.equal(hasImportCapability(KEY), false);
      assert.equal(hasImportCapability('otherCapability'), true);
    });
  });

  it('answers false for an empty or missing key even when a matching entry exists', () => {
    publishImportCapabilities({ '': true, undefined: true });
    assert.equal(hasImportCapability(''), false);
    assert.equal(hasImportCapability(undefined), false);
    assert.equal(hasImportCapability(null), false);
  });

  it('replaces the previous map on republish instead of merging it', () => {
    publishImportCapabilities({ [KEY]: true });
    publishImportCapabilities({ otherCapability: true });
    assert.equal(hasImportCapability(KEY), false);
    assert.equal(hasImportCapability('otherCapability'), true);
  });

  describe('publishing a non-object resets every capability to off', () => {
    for (const value of [null, undefined, 'structuredAddressForSepa', true]) {
      it(`${JSON.stringify(value) ?? 'undefined'}`, () => {
        publishImportCapabilities({ [KEY]: true });
        publishImportCapabilities(value);
        assert.equal(hasImportCapability(KEY), false);
      });
    }
  });

  it('forgets the published map on the test reset', () => {
    publishImportCapabilities({ [KEY]: true });
    resetImportCapabilitiesForTests();
    assert.equal(hasImportCapability(KEY), false);
  });
});
