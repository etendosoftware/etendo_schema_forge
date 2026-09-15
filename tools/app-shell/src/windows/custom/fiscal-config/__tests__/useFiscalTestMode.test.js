import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useFiscalTestMode.js'), 'utf8');

// Guards: public API of useFiscalTestMode.js is intact (ETP-5272)
describe('useFiscalTestMode — exports', () => {
  it('exports useFiscalTestMode as a named function', () => {
    assert.match(src, /export function useFiscalTestMode/);
  });
});

describe('useFiscalTestMode — hook structure', () => {
  it('uses useApiFetch to obtain the authenticated fetch function', () => {
    assert.match(src, /useApiFetch/);
  });

  it('fetches from the /fiscal-test-mode endpoint', () => {
    assert.match(src, /apiFetch\(\s*'\/fiscal-test-mode'/);
  });

  it('defaults forceTestMode to false', () => {
    assert.match(src, /useState\(false\)/);
  });

  it('guards the fetch when apiBaseUrl is absent', () => {
    assert.match(src, /if \(!apiBaseUrl\)/);
  });

  it('treats a non-ok response as an error (throws before parsing json)', () => {
    assert.match(src, /if \(!res\.ok\)\s*throw new Error/);
  });

  it('only sets forceTestMode true on an explicit === true value from the response', () => {
    assert.match(src, /data\?\.forceTestMode === true/);
  });

  it('FAILS OPEN: the catch branch resets forceTestMode to false, never true', () => {
    assert.match(src, /\.catch\(err => \{[\s\S]{0,300}setForceTestMode\(false\)/);
  });

  it('never silently swallows a fetch failure — logs via console.warn', () => {
    assert.match(src, /console\.warn\(/);
  });

  it('uses AbortController to cancel in-flight fetch on cleanup', () => {
    assert.match(src, /new AbortController\(\)/);
    assert.match(src, /controller\.abort\(\)/);
    assert.match(src, /controller\.signal\.aborted/);
  });

  it('includes apiBaseUrl and apiFetch in the effect dependency array', () => {
    assert.match(src, /\[apiFetch,\s*apiBaseUrl\]/);
  });

  it('returns forceTestMode from the hook', () => {
    assert.match(src, /return\s*\{\s*forceTestMode\s*\}/);
  });
});
