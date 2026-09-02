/**
 * Structural guard for `useActiveAccountingDimensions` (ETP-4950).
 *
 * The hook's behaviour is covered by `useActiveAccountingDimensions.vitest.jsx` (it needs React +
 * jsdom, which plain `node --test` cannot provide). This source-reading companion locks the two
 * contracts a future edit could break silently — the endpoint shape and the fail-open policy — and
 * keeps the hook covered by a `.test.js` the missing-tests detector recognises.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useActiveAccountingDimensions.js'), 'utf8');

describe('useActiveAccountingDimensions (source contract)', () => {
  it('exports the named hook', () => {
    assert.match(src, /export function useActiveAccountingDimensions\(/);
  });

  it('accepts the entity plus an options object with apiBaseUrl and enabled (default true)', () => {
    assert.match(src, /useActiveAccountingDimensions\(entity, \{[^}]*apiBaseUrl[^}]*enabled = true[^}]*\} = \{\}\)/s);
  });

  it('requests the activeDimensions action for the given entity', () => {
    assert.match(src, /\/\$\{entity\}\?action=activeDimensions/);
  });

  it('routes the request through useApiFetch (no bare fetch)', () => {
    assert.match(src, /import \{ useApiFetch \} from '@\/auth\/useApiFetch\.js'/);
    assert.match(src, /useApiFetch\(apiBaseUrl\)/);
    assert.doesNotMatch(src, /(^|[^.\w])fetch\(/m);
  });

  it('initialises the answer to null so consumers do not filter while it is unknown', () => {
    assert.match(src, /useState\(null\)/);
  });

  it('skips the request entirely when disabled or entity-less', () => {
    assert.match(src, /if \(!enabled \|\| !entity\)/);
  });

  it('fails open on a non-ok response (returns before touching state)', () => {
    assert.match(src, /if \(!res\.ok\) return;/);
  });

  it('fails open on a thrown request via an empty catch', () => {
    assert.match(src, /\} catch \{/);
  });

  it('only accepts an array of dimensions from the response.data envelope', () => {
    assert.match(src, /json\?\.response\?\.data\?\.dimensions/);
    assert.match(src, /Array\.isArray\(list\)/);
  });

  it('guards against a late resolution after unmount', () => {
    assert.match(src, /let cancelled = false/);
    assert.match(src, /return \(\) => \{ cancelled = true; \}/);
  });

  it('keeps apiFetch, entity and enabled in the effect dependency list', () => {
    assert.match(src, /\}, \[apiFetch, entity, enabled\]\)/);
  });
});
