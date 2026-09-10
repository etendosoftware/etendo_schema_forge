// Node test runner, source-reading — see project conventions in
// .claude/agents/test-generator.md. This replaces the sibling NewAccountModal.vitest.jsx
// (ETP-5101), which was never collected by any test runner: Vitest's `include` glob in
// tools/app-shell/vitest.config.js is rooted at `src/**`, so nothing under the repo-root
// `artifacts/` tree is ever picked up by that runner (see docs/feedback.md's ETP-4841
// entry — three sibling `.vitest.jsx` files under `artifacts/` silently never ran for the
// same reason, and AccountTreeView.test.js in this same directory documents the same fix
// for a different ETP-5101 regression). `.test.js` files here DO run, via
// `node --test 'artifacts/**/__tests__/*.test.js'`.
//
// The retired file rendered the real component tree (Dialog mocked inline, AccountCodeField
// and AccountBadgeSelect NOT mocked) so it could assert on live DOM `placeholder` attributes
// and `toast.error` call args. This file instead pins the same behavior at the source level:
//
//   1. the `lastUsedSuffix` useMemo — highest existing 4-digit suffix (under the selected
//      parent prefix) + 1, undefined when no prefix is selected or nothing exists yet under
//      it, clamped at 9999 — and that it is wired into AccountCodeField's `placeholder` prop.
//   2. handleSave's error-toast contract — parseBackendErrorMessage + a `msg || 'Error
//      ${status}'` fallback feeding translateBackendError, with `ui('newSubAccountError')`
//      only as the last resort when translateBackendError itself returns falsy.
//
// One assertion gap vs. the retired file, called out explicitly rather than papered over:
// the retired file had two separate "it"s for "backend sends a message this app recognizes"
// vs. "backend sends a message this app doesn't recognize" — both expected `toast.error` to
// receive the raw backend string verbatim. At the source level these collapse into a single
// assertion: NewAccountModal always calls `translateBackendError(err.message, ui)` and uses
// its return value as-is. Whether a *specific* string is translated or passed through
// unmapped is entirely `translateBackendError`'s own decision, not NewAccountModal's — and
// that decision is already covered by tools/app-shell/src/lib/__tests__/backendErrors.test.js.
// Re-deriving that distinction here via regex on this file's source would just be re-asserting
// the same call-site line twice under different names, so it is not duplicated.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'NewAccountModal.jsx'), 'utf8');
const codeFieldSrc = readFileSync(join(__dirname, '..', 'AccountCodeField.jsx'), 'utf8');

describe('NewAccountModal — renders the expected form fields', () => {
  it('renders the parent selector and account code field with their stable test ids', () => {
    assert.match(src, /data-testid="new-account-modal-parent"/);
    assert.match(src, /data-testid="new-account-modal-code"/);
    assert.match(src, /data-testid="new-account-modal-name"/);
    assert.match(src, /data-testid="new-account-modal-save"/);
  });
});

describe('NewAccountModal — lastUsedSuffix placeholder hint (ETP-5101)', () => {
  it('returns undefined (no hint) when no parent prefix is selected yet', () => {
    assert.match(
      src,
      /const lastUsedSuffix = useMemo\(\(\) => \{\s*if \(!selectedParentCodePrefix\) return undefined;/,
    );
  });

  it('scans only 8-digit codes under the selected prefix and tracks the highest suffix seen', () => {
    // Pins the "compare, don't coincidentally pick the last/first entry" contract: the loop
    // must filter by code length + prefix match, then compare each candidate against a
    // running max rather than just taking the last matching row.
    assert.match(
      src,
      /for \(const a of accountRows\) \{\s*const code = String\(a\.searchKey \?\? ''\);\s*if \(code\.length !== 8 \|\| !code\.startsWith\(selectedParentCodePrefix\)\) continue;\s*const suffix = Number\(code\.slice\(4\)\);\s*if \(Number\.isFinite\(suffix\) && suffix > max\) max = suffix;\s*\}/,
    );
  });

  it('falls back to undefined (AccountCodeField’s own default) when nothing exists yet under the prefix', () => {
    assert.match(src, /if \(max < 0\) return undefined;/);
  });

  it('hints max + 1, clamped at 9999, zero-padded to 4 digits', () => {
    assert.match(
      src,
      /return String\(Math\.min\(max \+ 1, 9999\)\)\.padStart\(4, '0'\);/,
    );
  });

  it('wires lastUsedSuffix into AccountCodeField’s placeholder prop', () => {
    assert.match(src, /placeholder=\{lastUsedSuffix\}/);
  });

  it('AccountCodeField falls back to its own default suffix placeholder when none is passed', () => {
    // Confirms the other half of the wiring the retired render test proved end to end:
    // when NewAccountModal hands down `undefined` (no prefix / no siblings), the suffix
    // input's placeholder still resolves to a real value rather than staying blank.
    assert.match(codeFieldSrc, /placeholder=\{placeholder \?\? ui\('codeSuffixPlaceholder'\)\}/);
  });
});

describe('NewAccountModal — save error toast contract (ETP-5101)', () => {
  it('runs a failed POST response through parseBackendErrorMessage before surfacing it', () => {
    assert.match(
      src,
      /if \(!res\.ok\) \{\s*const msg = await parseBackendErrorMessage\(res\);\s*throw new Error\(msg \|\| `Error \$\{res\.status\}`\);\s*\}/,
    );
  });

  it('falls back to "Error <status>" verbatim when the backend body carries no error message at all', () => {
    // parseBackendErrorMessage resolving to '' / undefined must not produce a blank or
    // generic-only error — the HTTP status is always named.
    assert.match(src, /msg \|\| `Error \$\{res\.status\}`/);
  });

  it('surfaces the resolved message via translateBackendError, only falling back to the generic toast as a last resort', () => {
    assert.match(
      src,
      /toast\.error\(translateBackendError\(err\.message, ui\) \|\| ui\('newSubAccountError'\)\);/,
    );
  });

  it('imports parseBackendErrorMessage and translateBackendError from the canonical backendErrors module', () => {
    assert.match(
      src,
      /import \{ parseBackendErrorMessage, translateBackendError \} from '@\/lib\/backendErrors\.js';/,
    );
  });
});
