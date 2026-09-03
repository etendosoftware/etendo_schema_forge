// Node test runner, source-reading — see project conventions in
// .claude/agents/test-generator.md. AccountTreeView.jsx is NOT collected by
// `npx vitest run` today: Vitest's `include` glob in tools/app-shell/vitest.config.js
// is rooted at `src/**`, so nothing under the repo-root `artifacts/` tree is ever
// picked up by that runner (see docs/feedback.md's ETP-4841 entry — three sibling
// `.vitest.jsx` files under `artifacts/` silently never ran for the same reason).
// `.test.js` files here DO run, via `node --test 'artifacts/**/__tests__/*.test.js'`.
//
// A full render test is also disproportionate for this fix: AccountTreeView
// unconditionally mounts NewAccountModal (Radix Popover/cmdk, needing jsdom
// pointer-capture shims) and the tree-building/DataTable inline-toggle machinery,
// none of which this regression touches. This test instead pins the structural
// contract of the ETP-5101 fix: the self-fetch effect must call
// `rememberRecordVersions(rows)` on the fetched rows BEFORE storing them, so the
// grid's inline active-toggle PATCH always has a remembered `updated` concurrency
// token and does not 400 with `missing_updated`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'AccountTreeView.jsx'), 'utf8');

describe('AccountTreeView — self-fetch remembers record versions (ETP-5101)', () => {
  it('imports rememberRecordVersions from the canonical recordVersions module', () => {
    assert.match(
      src,
      /import\s*{\s*rememberRecordVersions\s*}\s*from\s*'@etendosoftware\/app-shell-core\/lib\/recordVersions\.js'/,
    );
  });

  it('calls rememberRecordVersions(rows) inside the self-fetch effect, guarded by the same array check as setFetchedData', () => {
    // Isolate the self-fetch useEffect body (the one that hits `/elementValue?...`)
    // so the assertion can't accidentally match an unrelated call elsewhere in the file.
    const effectMatch = src.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?\/elementValue\?_startRow=0&_endRow=\$\{FULL_FETCH_END_ROW\}[\s\S]*?\n {2}\}, \[apiBaseUrl, token, apiFetch, fetchGeneration\]\);/,
    );
    assert.ok(effectMatch, 'expected to find the self-fetch useEffect for /elementValue');
    const effectBody = effectMatch[0];

    assert.match(
      effectBody,
      /if\s*\(!cancelled\s*&&\s*Array\.isArray\(rows\)\)\s*\{\s*rememberRecordVersions\(rows\);\s*setFetchedData\(rows\);\s*\}/,
    );
  });

  it('calls rememberRecordVersions BEFORE setFetchedData, not after', () => {
    const rememberIdx = src.indexOf('rememberRecordVersions(rows)');
    const setFetchedIdx = src.indexOf('setFetchedData(rows)');
    assert.notEqual(rememberIdx, -1, 'rememberRecordVersions(rows) call not found');
    assert.notEqual(setFetchedIdx, -1, 'setFetchedData(rows) call not found');
    assert.ok(
      rememberIdx < setFetchedIdx,
      'rememberRecordVersions(rows) must run before setFetchedData(rows) so the toggle has a token as soon as data is rendered',
    );
  });
});
