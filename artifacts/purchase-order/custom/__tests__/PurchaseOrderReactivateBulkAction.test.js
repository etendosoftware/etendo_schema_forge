/**
 * ETP-5315 / ETP-5302 — grid bulk-select document actions for Purchase Order.
 *
 * Source-reading test, mirroring the convention already used for
 * BulkPurchaseOrderMoreMenu.test.js in this same directory: vitest's include
 * glob is scoped to `tools/app-shell/src/**`, so a `.vitest.jsx` render test
 * placed under `artifacts/` (where this component lives, alongside its
 * sales-order counterpart OrderReactivateBulkAction.jsx) is never picked up.
 * `BulkDocumentAction` itself already has full render/behavioral coverage
 * (tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx),
 * and this wrapper's own render behaviour is covered from the app-shell side in
 * tools/app-shell/src/windows/custom/purchase-order/__tests__/
 * (PurchaseOrderBulkActions.singleProcessButton.vitest.jsx +
 * PurchaseOrderReactivateBulkAction.mixedSelection.vitest.jsx), so this file
 * only needs to prove the thin wrapper wires the right contract.
 *
 * ETP-5302 collapsed this window's two bulk buttons into one: ETP-5315 had shipped
 * Reactivate as a SECOND BulkDocumentAction beside the pre-existing CO-only one,
 * which forced two workarounds that are now deleted — a local
 * `buildReactivateActions` emitting only 'RE' (so the two buttons would not both
 * offer 'CO') and a `reactivateBulk` label (so a mixed draft+completed selection
 * would not show two identically-named buttons). With a single "Procesar" button
 * whose dropdown offers Confirmar and/or Reactivar, this file is a verbatim mirror
 * of sales-order's OrderReactivateBulkAction.jsx, and the assertions below say so.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseOrderReactivateBulkAction.jsx'), 'utf8');

// The rendered JSX only — the file's prose comments legitimately NAME the retired
// `buildReactivateActions` / `reactivateBulk` while explaining why they are gone,
// so a whole-file `doesNotMatch` would fail on the explanation itself.
const jsxBlock = (() => {
  const m = src.match(/return\s*\(?\s*<BulkDocumentAction[\s\S]*?\/>\s*\)?;/);
  assert.ok(m, 'could not locate the rendered <BulkDocumentAction /> block');
  return m[0];
})();

describe('PurchaseOrderReactivateBulkAction source (ETP-5315, single-button rework ETP-5302)', () => {
  it('exports PurchaseOrderReactivateBulkAction as the default component', () => {
    assert.match(src, /export default function PurchaseOrderReactivateBulkAction/);
  });

  it('imports BulkDocumentAction and useUI', () => {
    assert.match(src, /import\s+BulkDocumentAction\s+from\s+'@\/components\/contract-ui\/BulkDocumentAction'/);
    assert.match(src, /import\s+\{\s*useUI\s*\}\s+from\s+'@\/i18n'/);
  });

  it('delegates to the shared BulkDocumentAction, spreading its props through', () => {
    assert.match(jsxBlock, /<BulkDocumentAction\s+\{\.\.\.props\}/);
    assert.match(jsxBlock, /rowFilter=\{rowFilter\}/);
  });

  it('blocks the RE action for a row with hasLinkedDocuments via the cannotReactivateLinkedDocs key', () => {
    assert.match(src, /action === 'RE' && row\.hasLinkedDocuments/);
    assert.match(src, /return ui\('cannotReactivateLinkedDocs'\)/);
  });

  it('allows every other case (falls through to return true)', () => {
    assert.match(src, /return true;/);
  });

  it('uses i18n for the rejection message (no hardcoded strings)', () => {
    assert.match(src, /useUI\(\)/);
  });

  // ETP-5302 — the bar's single button reads "Procesar"; "Confirmar" and "Reactivar"
  // are DROPDOWN OPTION labels emitted by BulkDocumentAction's own action builder,
  // not button labels. Both `confirmBulk` and `reactivateBulk` have been deleted from
  // every locale file, so either one reappearing here is a dangling key.
  it('labels the bulk button with the process key, never the deleted confirmBulk / reactivateBulk keys', () => {
    assert.match(jsxBlock, /labelKey="process"/);
    assert.doesNotMatch(jsxBlock, /confirmBulk/);
    assert.doesNotMatch(jsxBlock, /reactivateBulk/);
  });

  // The whole point of the rework: no local action builder. BulkDocumentAction's
  // DEFAULT builder offers 'CO' when any selected row is a draft and 'RE' when any is
  // completed, which is exactly the menu this window needs now that it owns the only
  // document-action button in the bar. A `buildActions` prop here would silently drop
  // one of the two entries again — the ETP-5315 shape this ticket undid.
  it('passes NO buildActions prop — it relies on BulkDocumentAction default CO/RE builder', () => {
    assert.doesNotMatch(jsxBlock, /buildActions=/);
  });

  it('no longer declares the retired buildReactivateActions helper', () => {
    assert.doesNotMatch(src, /const buildReactivateActions\s*=/);
  });
});
