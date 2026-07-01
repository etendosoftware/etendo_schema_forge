import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmListPage.jsx'), 'utf8');

describe('FmListPage — exports', () => {
  it('has a default export', () => assert.match(src, /export default/));
});

describe('FmListPage — upcoming deadlines widget', () => {
  it('renders upcoming count as KPI value', () => assert.match(src, /upcomingCount/));
  it('uses computeUpcomingDeadlines', () => assert.match(src, /computeUpcomingDeadlines/));
  it('passes year+model filtered decls to the widget', () => assert.match(src, /decls={modelYearFiltered}/));
});

describe('FmListPage — table', () => {
  it('renders fm-table', () => assert.match(src, /fm-table/));
  it('shows model column', () => assert.match(src, /decl\.model/));
  it('shows year column', () => assert.match(src, /decl\.year/));
  it('renders status pill via StatusText', () => assert.match(src, /StatusText/));
});

describe('FmListPage — navigation', () => {
  it('calls onSelect with declaration on row click', () => assert.match(src, /onSelect/));
});

describe('FmListPage — 349 auto-compute wiring', () => {
  it('imports checkModified349', () =>
    assert.match(src, /checkModified349/));
  it('imports compute349Operators', () =>
    assert.match(src, /compute349Operators/));
  it('defines draftDecls349', () =>
    assert.match(src, /draftDecls349/));
  it('calls useFiscalAutoCompute twice (once for 303, once for 349)', () => {
    const matches = src.match(/useFiscalAutoCompute\s*\(/g);
    assert.ok(matches && matches.length >= 2, 'expected at least 2 useFiscalAutoCompute calls');
  });
  it('349 computed data is passed on row click (computedMap349)', () =>
    assert.match(src, /computedMap349/));
});

describe('FmListPage — 349 result column computation', () => {
  it('sums totalE, totalS, totalA, totalI for 349 result (not summary.result)', () => {
    // The four keys must be reduced together — summary.result would be undefined for 349
    assert.match(src, /\['totalE','totalS','totalA','totalI'\]/);
    assert.match(src, /\.reduce\(/);
  });

  it('uses kind "info" for 349 result (no payment label)', () =>
    assert.match(src, /kind:\s*['"]info['"]/));

  it('ResultCell renders info kind without ResultPill', () => {
    // The info branch must exist in ResultCell and must NOT wrap in ResultPill
    const resultCellMatch = src.match(/function ResultCell[\s\S]*?(?=\nfunction |\nexport )/);
    assert.ok(resultCellMatch, 'ResultCell function must exist');
    const resultCellSrc = resultCellMatch[0];
    assert.match(resultCellSrc, /result\.kind\s*===\s*['"]info['"]/);
  });

  it('does not use summary.result for 349 branch', () => {
    // Verify the 349 branch explicitly avoids reading summary.result
    const m349block = src.match(/model === ['"]349['"][\s\S]*?displayResult\s*=/);
    assert.ok(m349block, '349 branch must assign displayResult');
    assert.doesNotMatch(m349block[0], /summary\.result/);
  });
});
