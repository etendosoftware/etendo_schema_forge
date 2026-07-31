import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DataTable.jsx'), 'utf8');

describe('DataTable — numeric column header alignment (ETP-4136)', () => {
  it('applies text-right class to TableHead for numeric column types', () => {
    // The className uses a filter-join pattern over an entry list:
    // ['align-middle', NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right' : '', col.headClass || '']
    //   .filter(Boolean).join(' ')
    // The entries are asserted separately from the join on purpose: ETP-4658 appended
    // `col.headClass` after the numeric ternary (per-column chrome, covered by
    // DataTable.columnChrome.vitest.jsx), and pinning them as adjacent made this guard
    // fail on a change that never touched the alignment it protects.
    assert.match(src, /'align-middle',\s*NUMERIC_FIELD_TYPES\.has\(col\.type\) \? 'text-right' : '',/);
    assert.match(src, /\]\.filter\(Boolean\)\.join\(' '\)/);
  });

  it('applies text-right to the sort button for numeric column types', () => {
    // The sort button className ternary: NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right' : 'text-left'
    assert.match(src, /NUMERIC_FIELD_TYPES\.has\(col\.type\) \? 'text-right' : 'text-left'/);
  });

  it('applies text-right to the non-sortable span for numeric column types', () => {
    // The span className uses a leading-space variant: ' text-right'
    assert.match(src, /NUMERIC_FIELD_TYPES\.has\(col\.type\) \? ' text-right' : ''/);
  });
});
