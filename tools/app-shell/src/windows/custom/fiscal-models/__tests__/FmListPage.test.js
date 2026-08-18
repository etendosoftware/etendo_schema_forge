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
  it('uses countUpcomingDeadlines', () => assert.match(src, /countUpcomingDeadlines/));
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

describe('FmListPage — non-draft "Resultado" auto-compute (ETP-4755)', () => {
  it('defines otherDecls303 and otherDecls349 (non-draft filters)', () => {
    assert.match(src, /otherDecls303/);
    assert.match(src, /otherDecls349/);
  });

  it('otherDecls303/otherDecls349 filter on status !== "draft"', () => {
    const block303 = src.match(/otherDecls303\s*=\s*useMemo\(\s*\(\)\s*=>[\s\S]*?\[decls\]\s*\);/);
    assert.ok(block303, 'otherDecls303 useMemo must exist');
    assert.match(block303[0], /d\.status !== ['"]draft['"]/);

    const block349 = src.match(/otherDecls349\s*=\s*useMemo\(\s*\(\)\s*=>[\s\S]*?\[decls\]\s*\);/);
    assert.ok(block349, 'otherDecls349 useMemo must exist');
    assert.match(block349[0], /d\.status !== ['"]draft['"]/);
  });

  it('calls useFiscalAutoCompute 4 times (draft 303, draft 349, other 303, other 349)', () => {
    const matches = src.match(/useFiscalAutoCompute\s*\(/g);
    assert.ok(matches && matches.length === 4, `expected exactly 4 useFiscalAutoCompute calls, got ${matches?.length}`);
  });

  it('defines computedMapOther303 and computedMapOther349', () => {
    assert.match(src, /computedMapOther303/);
    assert.match(src, /computedMapOther349/);
  });

  it('the otherDecls303 hook call has no checkModifiedFn (one-time compute, no polling)', () => {
    const block = src.match(/useFiscalAutoCompute\(otherDecls303,\s*\{[\s\S]*?\}\);/);
    assert.ok(block, 'otherDecls303 useFiscalAutoCompute call must exist');
    assert.doesNotMatch(block[0], /checkModifiedFn/);
    assert.match(block[0], /enabled:\s*Boolean\(token && apiBaseUrl\)/);
  });

  it('the otherDecls349 hook call has no checkModifiedFn (one-time compute, no polling)', () => {
    const block = src.match(/useFiscalAutoCompute\(otherDecls349,\s*\{[\s\S]*?\}\);/);
    assert.ok(block, 'otherDecls349 useFiscalAutoCompute call must exist');
    assert.doesNotMatch(block[0], /checkModifiedFn/);
    assert.match(block[0], /enabled:\s*Boolean\(token && apiBaseUrl\)/);
  });

  it('the draft hooks still carry a checkModifiedFn (polling stays enabled for drafts)', () => {
    const block303 = src.match(/useFiscalAutoCompute\(draftDecls303,\s*\{[\s\S]*?\}\);/);
    assert.ok(block303, 'draftDecls303 useFiscalAutoCompute call must exist');
    assert.match(block303[0], /checkModifiedFn:\s*checkModified303/);

    const block349 = src.match(/useFiscalAutoCompute\(draftDecls349,\s*\{[\s\S]*?\}\);/);
    assert.ok(block349, 'draftDecls349 useFiscalAutoCompute call must exist');
    assert.match(block349[0], /checkModifiedFn:\s*checkModified349/);
  });

  it('the "Resultado" column picks the map based on decl.status === "draft"', () => {
    assert.match(src, /const isDraft = decl\.status === ['"]draft['"];/);
    assert.match(src, /isDraft \? computedMap349\[decl\.id\] : computedMapOther349\[decl\.id\]/);
    assert.match(src, /isDraft \? computedMap\[decl\.id\] : computedMapOther303\[decl\.id\]/);
  });
});
