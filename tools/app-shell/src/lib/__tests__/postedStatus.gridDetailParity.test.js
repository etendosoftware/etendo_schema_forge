// @covers tools/app-shell/src/lib/postedStatus.js
// @covers tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
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
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePostedStatus, postedStatusLabel, resolveStatusPill, postedStatusTone, isPostedBooleanValue,
} from '../postedStatus.js';

// Every domain code the registry documents, excluding the plain boolean pair
// ('Y'/'N'), whose LABEL each renderer words itself (only their tone is shared).
const DOMAIN_CODES = [
  'E', 'C', 'i', 'b', 'c', 'NC', 'AD', 'DT', 'NO', 'L', 'p', 'T', 'D', 'd', 'y', 'l',
];

function gridResolution(value) {
  // Mirrors DataTable.cellRenderers.jsx#renderPostedStatusCell's call shape.
  const ui = (key) => key;
  const posted = resolvePostedStatus('Posted', value);
  if (posted) return { label: postedStatusLabel(posted, ui), tone: posted.tone };
  if (!isPostedBooleanValue(value)) return null;
  return { label: null, tone: postedStatusTone(value) };
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

  it("'Y'/'N' get the same tone in the grid and the detail — N is the yellow warning (ETP-5647)", () => {
    // 'Y'/'N' keep a per-renderer label (badgeLabels / trueKey-falseKey), so
    // resolvePostedStatus still returns null for them; only the colour is shared.
    assert.equal(resolvePostedStatus('Posted', 'Y'), null);
    assert.equal(resolvePostedStatus('Posted', 'N'), null);

    assert.equal(gridResolution('Y').tone, detailResolution('Y').tone);
    assert.equal(gridResolution('N').tone, detailResolution('N').tone);
    assert.equal(gridResolution('N').tone, 'warning');
    assert.equal(gridResolution('Y').tone, 'success');

    const ui = (key) => key;
    const badge = { key: 'posted', trueKey: 'postedStatus', falseKey: 'notPostedStatus' };
    assert.deepEqual(resolveStatusPill(badge, 'Y', ui), { status: 'Y', label: 'postedStatus', tone: 'success' });
    assert.deepEqual(resolveStatusPill(badge, 'N', ui), { status: 'N', label: 'notPostedStatus', tone: 'warning' });
  });
});

/*
 * ETP-5647 — the posting colours live ONLY in lib/postedStatus.js. Every window used to
 * copy-paste `badgeVariants: { false: 'orange' }` onto its Posted column (13 decisions.json
 * plus 5 hand-written tables), so "Sin contabilizar" read as an orange error in the list
 * while the detail pill showed it as a yellow pending state. The grid now ignores
 * `badgeVariants` on a Posted column; this guard keeps a dead, misleading copy from being
 * declared again (the docs example it was copied from is fixed too).
 */
describe('no Posted column declares its own badgeVariants (ETP-5647 guard)', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

  function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__' || name === 'generated') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(jsx?|json)$/.test(name)) out.push(full);
    }
    return out;
  }

  function findPostedFieldsWithVariants(node, path, hits) {
    if (Array.isArray(node)) {
      node.forEach((child, i) => findPostedFieldsWithVariants(child, `${path}[${i}]`, hits));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'posted' && value && typeof value === 'object' && 'badgeVariants' in value) {
        hits.push(`${path}.posted`);
      }
      findPostedFieldsWithVariants(value, `${path}.${key}`, hits);
    }
  }

  it('no artifacts/*/decisions.json Posted field declares badgeVariants', () => {
    const artifacts = join(repoRoot, 'artifacts');
    const hits = [];
    for (const name of readdirSync(artifacts)) {
      const file = join(artifacts, name, 'decisions.json');
      if (!existsSync(file)) continue;
      findPostedFieldsWithVariants(JSON.parse(readFileSync(file, 'utf8')), name, hits);
    }
    assert.deepEqual(hits, [], 'remove badgeVariants — Posted colours come from lib/postedStatus.js');
  });

  it("no hand-written column with column: 'Posted' declares badgeVariants", () => {
    const roots = [
      join(repoRoot, 'tools/app-shell/src/windows/custom'),
      ...readdirSync(join(repoRoot, 'artifacts')).map((name) => join(repoRoot, 'artifacts', name, 'custom')),
    ];
    const offenders = roots.flatMap((root) => walk(root))
      .filter((file) => readFileSync(file, 'utf8').split('\n')
        .some((line) => /column:\s*['"]Posted['"]/.test(line) && /badgeVariants/.test(line)))
      .map((file) => relative(repoRoot, file));
    assert.deepEqual(offenders, [], 'remove badgeVariants — Posted colours come from lib/postedStatus.js');
  });
});
