/**
 * useClientSort — structural contract (source-reading).
 *
 * Behaviour lives in `useClientSort.vitest.jsx`; this file exists because the React hook cannot
 * be imported under the node runner (it resolves the `@/` alias and renders), and because the
 * repo's PR bot only recognises `.test.js` as coverage for a new source file.
 *
 * What it locks are the two invariants a future edit could quietly break.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useClientSort.js'), 'utf8');

describe('useClientSort — structure', () => {
  it('delegates the comparison to the shared pure helper', () => {
    assert.match(src, /import \{ sortRows \} from '@\/lib\/clientSort\.js'/);
    assert.match(src, /sortRows\(rows, \{/);
  });

  // A setter called from inside another setter's updater is an impure updater, which React may
  // run twice. The cycle must read the current state directly, like ListView.handleColumnSort.
  it('never calls a setter from inside another setter updater', () => {
    assert.doesNotMatch(src, /setSortKey\(\([\s\S]{0,400}?setSortDirection\(/);
  });

  // The third click must clear rather than jump to some default column — that is what keeps the
  // backend's own order (newest-first movements, transactionDate desc reconciliations) reachable.
  it('clears the key on the third click instead of substituting a default column', () => {
    assert.match(src, /setSortKey\(null\)/);
    assert.doesNotMatch(src, /setSortKey\('creationDate'\)/);
  });

  // ETP-5083: `initialSort` + the one-shot first-click override. Behaviour is covered end-to-end
  // in useClientSort.vitest.jsx; this locks the structural invariants a future edit could break.
  it('accepts an optional initialSort and tracks whether the one-shot override is still available', () => {
    assert.match(src, /initialSort/);
    assert.match(src, /useState\(initialSort\?\.key \?\? null\)/);
    assert.match(src, /useState\(initialSort\?\.direction \?\? 'asc'\)/);
    assert.match(src, /seedUntouchedRef = useRef\(Boolean\(initialSort\)\)/);
  });

  // The override must fire at most once — consumed on the very first toggleSort call regardless
  // of which column it lands on — and only jump to a direction when that first click lands on
  // the seeded column itself.
  it('consumes the one-shot flag on the first toggle and only overrides when the seeded column is clicked', () => {
    assert.match(src, /if \(seedUntouchedRef\.current\) \{\s*seedUntouchedRef\.current = false;/);
    assert.match(src, /if \(key === initialSort\.key\) \{/);
  });
});
