/**
 * ETP-5075 — grid/detail parity for the `Posted` domain.
 *
 * This is the regression test for the actual defect: for the SAME raw value,
 * `DataTable.cellRenderers.jsx#renderBooleanCell` (the grid) and
 * `DetailView.jsx#renderStatusPillBadge` (the detail) each used to run their
 * own hardcoded 'Y'/'N' allowlist and disagreed on every other code — a
 * record whose posting attempt FAILED (e.g. 'i', invalid account) showed a
 * bare "—" in the grid and the orange "Not posted" pill in the detail.
 *
 * Both renderers now go through this same registry (`resolvePostedStatus` /
 * `resolveStatusPill`), so this test exercises the registry the way each
 * renderer actually calls it and asserts they agree — same label, same tone
 * family — for every domain code. It does not re-render the React
 * components (that is covered in the two component-level suites); it pins
 * the shared contract those renderers depend on so it cannot silently
 * diverge again without breaking a test here first.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePostedStatus, postedStatusLabel, resolveStatusPill } from '../postedStatus.js';

// Every domain code the registry documents, excluding the plain boolean pair
// ('Y'/'N') which both renderers already handled consistently before this fix.
const DOMAIN_CODES = [
  'E', 'C', 'i', 'b', 'c', 'NC', 'AD', 'DT', 'NO', 'L', 'p', 'T', 'D', 'd', 'y', 'l',
];

function gridResolution(value) {
  // Mirrors DataTable.cellRenderers.jsx#renderBooleanCell's call shape.
  const ui = (key) => key;
  const posted = resolvePostedStatus('Posted', value);
  if (!posted) return null;
  return { label: postedStatusLabel(posted, ui), tone: posted.tone };
}

function detailResolution(value) {
  // Mirrors DetailView.jsx#renderStatusPillBadge's call shape — a `statusPills`
  // extraBadges entry whose apiKey is 'posted' (no `column`, per the generator).
  const ui = (key) => key;
  const badge = { key: 'posted', trueKey: 'postedStatus', falseKey: 'notPostedStatus' };
  const pill = resolveStatusPill(badge, value, ui);
  if (!pill) return null;
  return { label: pill.label, tone: pill.tone };
}

describe('grid and detail agree on the same raw Posted value (ETP-5075 regression)', () => {
  for (const code of DOMAIN_CODES) {
    it(`code '${code}' renders the same label and tone in both the grid and the detail`, () => {
      const grid = gridResolution(code);
      const detail = detailResolution(code);

      assert.notEqual(grid, null, `grid must not fall back to the em-dash for '${code}'`);
      assert.notEqual(detail, null, `detail must not fall back to trueKey/falseKey for '${code}'`);
      assert.equal(grid.label, detail.label, `label mismatch for code '${code}'`);
      assert.equal(grid.tone, detail.tone, `tone mismatch for code '${code}'`);
    });
  }

  it("'i' (invalid account) specifically must no longer read as 'Not posted' in either renderer", () => {
    const grid = gridResolution('i');
    const detail = detailResolution('i');

    assert.notEqual(grid.label, 'notPostedStatus');
    assert.notEqual(detail.label, 'notPostedStatus');
    assert.equal(grid.label, 'postedStatusInvalidAccount');
    assert.equal(detail.label, 'postedStatusInvalidAccount');
  });

  it("'Y'/'N' still resolve identically in both renderers (no regression on the boolean path)", () => {
    // Neither renderer routes 'Y'/'N' through resolvePostedStatus/resolveStatusPill's
    // domain branch (both return null / fall to the true/false branch), so the
    // registry only guarantees parity for what it actually claims — assert that here.
    assert.equal(resolvePostedStatus('Posted', 'Y'), null);
    assert.equal(resolvePostedStatus('Posted', 'N'), null);

    const ui = (key) => key;
    const badge = { key: 'posted', trueKey: 'postedStatus', falseKey: 'notPostedStatus' };
    assert.deepEqual(resolveStatusPill(badge, 'Y', ui), { status: 'Y', label: 'postedStatus', tone: 'success' });
    assert.deepEqual(resolveStatusPill(badge, 'N', ui), { status: 'N', label: 'notPostedStatus', tone: 'warning' });
  });
});
