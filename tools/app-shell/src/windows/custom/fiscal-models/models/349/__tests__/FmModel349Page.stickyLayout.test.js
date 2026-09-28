// Source-reading tests for ETP-5456 (sticky-layout follow-up) on
// FmModel349Page.jsx's "Operadores" tab: two sticky regions were added there,
// stacked below `.fm-tabs-sticky` (top: 0) — the filter/search row (top: 49)
// and `.fm-349-totals` / TotalsCard (top: 97, asserted at the CSS level in
// fiscal-models.css.stickyLayout.test.js). This file asserts the inline JSX
// side: the sticky declarations exist with the right `top`, the totals+table
// row has `alignItems: 'flex-start'` (stretch would defeat sticky, same bug
// class 303's CasillasTab needed fixed), and the filter row uses padding
// (not margin) around its sticky offset — margin would shift the actual
// stick point away from `top: 49` since sticky offsets measure from the
// margin edge. jsdom does not compute real sticky geometry, so this stays a
// source-level assertion, following the pattern in FmModel349Page.test.js /
// FmCommon.test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmModel349Page.jsx'), 'utf8');

// Isolate the "Operadores" tab JSX block so assertions can't accidentally
// match unrelated code elsewhere in this (large) file.
const startMarker = "activeTab === 'operators'";
const endMarker = "activeTab === 'rectif'";
const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker);
assert.ok(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx, 'could not isolate the operators tab block');
const operatorsTab = src.slice(startIdx, endIdx);

describe('FmModel349Page — Operadores tab sticky filter row (ETP-5456)', () => {
  it('the filter/search row is position: sticky at top: 49 (docks under .fm-tabs-sticky)', () => {
    const filterRow = operatorsTab.slice(0, operatorsTab.indexOf('Full-width separator'));
    assert.match(filterRow, /position:\s*'sticky'/);
    assert.match(filterRow, /top:\s*49\b/);
  });

  it('the filter row has a background so scrolling rows do not show through it once pinned', () => {
    const filterRow = operatorsTab.slice(0, operatorsTab.indexOf('Full-width separator'));
    assert.match(filterRow, /background:\s*'hsl\(var\(--card\)\)'/);
  });

  it('the filter row uses padding, not margin, around its sticky offset', () => {
    const filterRow = operatorsTab.slice(0, operatorsTab.indexOf('Full-width separator'));
    assert.match(filterRow, /paddingTop:\s*8/);
    assert.match(filterRow, /paddingBottom:\s*4/);
    assert.doesNotMatch(filterRow, /marginTop:/);
    assert.doesNotMatch(filterRow, /marginBottom:/);
  });
});

describe('FmModel349Page — Operadores tab totals+table row (ETP-5456)', () => {
  const totalsRow = operatorsTab.slice(operatorsTab.indexOf('Full-width separator'));

  it("the totals+table flex row sets alignItems: 'flex-start' (stretch would defeat TotalsCard's sticky)", () => {
    assert.match(totalsRow, /alignItems:\s*'flex-start'/);
  });

  it('TotalsCard is rendered inside that flex-start row', () => {
    assert.match(totalsRow, /<TotalsCard/);
  });
});

describe('FmModel349Page — Operadores tab: no overflow/transform/filter/contain between the sticky elements and .fm-page', () => {
  it('the operators tab block does not introduce a nested overflow wrapper', () => {
    assert.doesNotMatch(operatorsTab, /overflow:\s*'auto'/);
    assert.doesNotMatch(operatorsTab, /overflowY:\s*'auto'/);
    assert.doesNotMatch(operatorsTab, /overflowX:\s*'auto'/);
  });

  it('the operators tab block does not set transform, filter or contain on any wrapper', () => {
    assert.doesNotMatch(operatorsTab, /\btransform:/);
    assert.doesNotMatch(operatorsTab, /\bfilter:\s*'/);
    assert.doesNotMatch(operatorsTab, /\bcontain:/);
  });
});
