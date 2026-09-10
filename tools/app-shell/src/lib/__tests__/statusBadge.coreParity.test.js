import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_ORDER as LOCAL_ORDER, compareStatusCodes as localCompare } from '../statusBadge.js';

// ETP-4913 — the fixed status order lives in TWO places on purpose:
//
//   - this repo's lib/statusBadge.js, used by the "All statuses" quick-filter
//     pill (ListFilterBar.jsx) and the grid cell badges;
//   - the core package's lib/statusBadge.js, used by the advanced filter's
//     value picker (DistinctEnumPicker in AdvancedFilterBuilder.jsx, which
//     lives in schema_forge_core).
//
// Unifying them was rejected for this ticket: the two copies of statusBadge.js
// have diverged in getStatusTone and in every CSS-class helper (semantic theme
// tokens here vs. raw Tailwind classes in core), so making one a re-export of
// the other would repaint <StatusTag> across StatementsTable, StatementLinesTable,
// DocChip and AssetsAmortizationPanel — a visual blast radius unrelated to this
// fix.
//
// This test is the guardrail that makes the duplication safe: the two dropdowns
// must never disagree about the order of the same codes, so a drift between the
// copies has to fail the build rather than ship a visibly inconsistent UI.
//
// `node --test` does not honour the LOCAL_CORE Vite alias, so this always
// resolves the PUBLISHED @etendosoftware/app-shell-core — which is also the
// point: it verifies the published artifact really carries the fix, not just
// the local core source.
//
// Guarded dynamic import so the suite SKIPS (rather than fails) until the core
// release exporting STATUS_ORDER is published and the dependency here is
// bumped. Same pre-publish idiom as cli/test/slice-labels.test.js. Once the
// bump lands, CI resolves the exports and the parity assertions start running.
let core = null;
try {
  const mod = await import('@etendosoftware/app-shell-core/lib/statusBadge.js');
  if (mod.STATUS_ORDER && mod.compareStatusCodes) core = mod;
} catch {
  // Subpath not resolvable at all (pre-publish); suite is skipped below.
}

const skip = core
  ? false
  : '@etendosoftware/app-shell-core/lib/statusBadge.js does not export STATUS_ORDER yet (pre-publish)';

/** A deliberately scrambled sample spanning every bucket of the catalog. */
const SAMPLE = [
  'VO', '??', 'CO', 'TEMP', 'DR', 'RPAP', 'NA', 'CL', 'IP', 'RE',
  'WP', 'CA', 'TMP', 'NC', 'AE', 'ZZZ_UNKNOWN', 'true', 'false',
];

describe('statusBadge STATUS_ORDER parity with @etendosoftware/app-shell-core', { skip }, () => {
  const CORE_ORDER = core?.STATUS_ORDER;
  const coreCompare = core?.compareStatusCodes;

  it('declares the identical code order in both copies', () => {
    assert.deepEqual(LOCAL_ORDER, CORE_ORDER);
  });

  it('sorts a scrambled sample identically with both comparators', () => {
    assert.deepEqual(SAMPLE.slice().sort(localCompare), SAMPLE.slice().sort(coreCompare));
  });

  it('agrees on every pairwise comparison within the catalog', () => {
    // deepEqual on the sorted arrays can hide an asymmetric comparator (two
    // codes that tie in one copy and not the other). Comparing the sign of
    // every pair pins the comparators themselves, not just one sample.
    for (const a of LOCAL_ORDER) {
      for (const b of LOCAL_ORDER) {
        assert.equal(
          Math.sign(localCompare(a, b)),
          Math.sign(coreCompare(a, b)),
          `comparators disagree on (${a}, ${b})`,
        );
      }
    }
  });
});
