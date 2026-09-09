import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// parseListSortBy — behavioral tests (ETP-4979)
//
// `parseListSortBy` lives inside ListView.jsx as a local (non-exported)
// function — see "Source finding" note below. ListView.jsx cannot be
// rendered in a pure Node environment (React + router + many hooks), so we
// cannot import and exercise the real component. Instead of falling back to
// pure regex-on-source assertions (which only prove the source text LOOKS
// right, not that the parsing logic BEHAVES right), we extract the exact
// function source with a regex and `new Function` it into a real, callable
// function — the same technique already used in this repo for pure-logic
// helpers embedded in components that can't be rendered under `node --test`
// (see ReportDrawer.vitest.jsx, GoodsReceiptActions.vitest.jsx,
// use349Pdf.vitest.jsx). This gives real behavioral coverage of the exact
// shipped logic, not a proxy for it.
//
// SOURCE FINDING (reported, not fixed — out of scope for a test-only task):
// `parseListSortBy` has zero unit test coverage prior to this file, across
// all 4 windows that currently use `window.listSortBy` (fiscal-calendar,
// open-close-period-control, financial-account, amortization). It is a
// small, pure, dependency-free function (string in, object out) — exporting
// it (`export function parseListSortBy(...)`) would not change any
// behavior and would let this suite import it directly instead of relying
// on source extraction + `new Function`. Recommend exporting it in a future
// change; not done here per the "never modify source" rule for this task.
// ---------------------------------------------------------------------------

const src = await readFile(new URL('../ListView.jsx', import.meta.url), 'utf8');

function extractParseListSortBy(source) {
  const match = source.match(/function parseListSortBy\(listSortBy\)\s*\{[\s\S]*?\n\}/);
  if (!match) {
    throw new Error('Could not locate parseListSortBy in ListView.jsx source');
  }
  return new Function(`${match[0]}\nreturn parseListSortBy;`)();
}

const parseListSortBy = extractParseListSortBy(src);

describe('parseListSortBy (ETP-4979)', () => {
  it('is present in ListView.jsx source (sanity check for the extraction regex)', () => {
    assert.match(src, /function parseListSortBy\(listSortBy\)/);
  });

  it('defaults to creationDate desc when listSortBy is null', () => {
    assert.deepEqual(parseListSortBy(null), {
      initialSortColumn: 'creationDate',
      initialSortDirection: 'desc',
    });
  });

  it('defaults to creationDate desc when listSortBy is undefined', () => {
    assert.deepEqual(parseListSortBy(undefined), {
      initialSortColumn: 'creationDate',
      initialSortDirection: 'desc',
    });
  });

  it('defaults to creationDate desc when listSortBy is an empty string', () => {
    assert.deepEqual(parseListSortBy(''), {
      initialSortColumn: 'creationDate',
      initialSortDirection: 'desc',
    });
  });

  it('defaults to creationDate desc when listSortBy is only whitespace', () => {
    assert.deepEqual(parseListSortBy('   '), {
      initialSortColumn: 'creationDate',
      initialSortDirection: 'desc',
    });
  });

  it('defaults direction to asc when only a field is given (no direction)', () => {
    assert.deepEqual(parseListSortBy('name'), {
      initialSortColumn: 'name',
      initialSortDirection: 'asc',
    });
  });

  it('parses field + explicit "asc" direction', () => {
    assert.deepEqual(parseListSortBy('name asc'), {
      initialSortColumn: 'name',
      initialSortDirection: 'asc',
    });
  });

  it('parses field + explicit "desc" direction', () => {
    assert.deepEqual(parseListSortBy('name desc'), {
      initialSortColumn: 'name',
      initialSortDirection: 'desc',
    });
  });

  it('parses the real ETP-4979 value: "accountingDate desc"', () => {
    assert.deepEqual(parseListSortBy('accountingDate desc'), {
      initialSortColumn: 'accountingDate',
      initialSortDirection: 'desc',
    });
  });

  it('tolerates extra surrounding whitespace', () => {
    assert.deepEqual(parseListSortBy('  accountingDate   desc  '), {
      initialSortColumn: 'accountingDate',
      initialSortDirection: 'desc',
    });
  });

  it('ignores a third whitespace-separated token (only field/direction are read)', () => {
    assert.deepEqual(parseListSortBy('accountingDate desc extraJunk'), {
      initialSortColumn: 'accountingDate',
      initialSortDirection: 'desc',
    });
  });
});
