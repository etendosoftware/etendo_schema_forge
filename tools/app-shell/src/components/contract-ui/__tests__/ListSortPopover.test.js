/**
 * ListSortPopover — structural contract (source-reading).
 *
 * Behaviour lives in `ListSortPopover.vitest.jsx`; this file satisfies the repo's
 * `.test.js`-only coverage detection for a new source file and pins the two decisions that
 * make the extraction from ListView safe to share.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ListSortPopover.jsx'), 'utf8');
const listView = readFileSync(join(__dirname, '..', 'ListView.jsx'), 'utf8');

describe('ListSortPopover — structure', () => {
  // The point of the extraction: ListView must RENDER it, not keep a second copy of the markup.
  it('is the only copy of the popover — ListView renders it', () => {
    assert.match(listView, /import \{ ListSortPopover \} from '\.\/ListSortPopover\.jsx'/);
    assert.match(listView, /<ListSortPopover/);
    assert.doesNotMatch(listView, /showSortPopover/);
  });

  // Labels must come from the same resolver the column header uses, or a menu entry can
  // disagree with the column it sorts.
  it('resolves labels through the shared column-label resolver', () => {
    assert.match(src, /import \{ resolveColumnLabel \} from '@\/lib\/resolveColumnLabel\.js'/);
    assert.match(src, /resolveColumnLabel\(col, locale, t\)/);
  });

  it('owns only its open state, never the sort state', () => {
    assert.match(src, /const \[open, setOpen\] = useState\(false\)/);
    assert.doesNotMatch(src, /useState\(sortColumn/);
    assert.doesNotMatch(src, /setSortColumn/);
  });

  it('honours DataTable\'s sortable opt-out convention', () => {
    assert.match(src, /columns\.filter\(\(col\) => col\.sortable !== false\)/);
  });
});
