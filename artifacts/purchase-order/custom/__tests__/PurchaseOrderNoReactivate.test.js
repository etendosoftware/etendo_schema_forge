/**
 * ETP-5315 supersedes ETP-4011: product (Valeria, Jira comment on ETP-5315)
 * confirmed Reactivate must be consistent across ALL THREE surfaces — form
 * kebab, grid bulk-select, and grid row-hover kebab — for both Sales Order
 * and Purchase Order. This file used to be a regression guard asserting the
 * OPPOSITE (no Reactivate anywhere in Purchase Order, per ETP-4011); it is
 * now rewritten as a positive guard for the ETP-5315 wiring so a future
 * regression can't silently strip Reactivate back out of Purchase Order.
 *
 * Reads `tools/app-shell/src/windows/custom/purchase-order/index.jsx` as
 * source and asserts that:
 *   1. PurchaseOrderReactivateBulkAction IS imported and wired into the grid
 *      bulk-action toolbar (grid bulk-select Reactivate).
 *   2. `showReactivate: true` is passed to useOrderWindow (grid row-hover
 *      kebab Reactivate — see useOrderWindow.jsx's own showReactivate test
 *      for the generic behavior, shared with sales-order).
 *   3. That bulk component is the bar's ONE document-action button (ETP-5302).
 *
 * Point 3 replaces an earlier pair of assertions that pinned the SEPARATE
 * CO-only `<BulkDocumentAction buildActions={buildInOutActions}>` this window
 * used to mount alongside it. ETP-5315 shipped bulk Reactivate as that second
 * button, which is exactly what the user reported on screen — "Procesar" and
 * "Reactivar" side by side for a mixed draft+completed selection, and a lone
 * "Reactivar" for a completed-only one. ETP-5302 folded both into a single
 * "Procesar" whose dropdown offers Confirmar and/or Reactivar, like every other
 * document window, so the CO-only mount (and the `buildInOutActions` import that
 * fed it) is gone and its absence is now the thing worth guarding.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Navigate from artifacts/purchase-order/custom/__tests__/ up to repo root,
// then into the custom window source.
const SRC_PATH = join(
  __dirname,
  '../../../../tools/app-shell/src/windows/custom/purchase-order/index.jsx',
);
const src = readFileSync(SRC_PATH, 'utf8');

describe('PurchaseOrderWindow — Reactivate wired consistently (ETP-5315, supersedes ETP-4011)', () => {
  it('imports PurchaseOrderReactivateBulkAction from the artifact custom dir', () => {
    assert.match(
      src,
      /import\s+PurchaseOrderReactivateBulkAction\s+from\s+'@generated\/purchase-order\/custom\/PurchaseOrderReactivateBulkAction'/,
      'PurchaseOrderReactivateBulkAction must be imported for the grid bulk-select Reactivate action (ETP-5315)',
    );
  });

  it('wires <PurchaseOrderReactivateBulkAction into the bulk-action toolbar', () => {
    assert.match(
      src,
      /<PurchaseOrderReactivateBulkAction\b/,
      'PurchaseOrderReactivateBulkAction must be rendered inside PurchaseOrderBulkActions',
    );
  });

  it('mounts it exactly once — it is the bar\'s only document-action button (ETP-5302)', () => {
    const mounts = src.match(/<PurchaseOrderReactivateBulkAction\b/g) ?? [];
    assert.equal(
      mounts.length,
      1,
      'The selection bar must carry ONE document-action button, not one per action',
    );
  });

  it('no longer mounts a separate CO-only BulkDocumentAction beside it (ETP-5302)', () => {
    assert.doesNotMatch(
      src,
      /<BulkDocumentAction\b/,
      'Confirmar is now an option inside the single Procesar dialog, not a second button',
    );
    // Matched on the import and the prop, not on the bare identifier: index.jsx's
    // own comment names `buildInOutActions` while explaining why it was retired.
    assert.doesNotMatch(
      src,
      /import[^\n]*\bbuildInOutActions\b[^\n]*from/,
      'The CO-only action builder went with the button it fed — nothing imports it here anymore',
    );
    assert.doesNotMatch(
      src,
      /buildActions=\{buildInOutActions\}/,
      'No component in this window may still be wired to the CO-only action builder',
    );
  });

  it('passes showReactivate: true to useOrderWindow (enables the row-hover kebab Reactivate item)', () => {
    assert.match(
      src,
      /showReactivate:\s*true/,
      'useOrderWindow must receive showReactivate: true so the row-hover kebab exposes Reactivate (ETP-5315)',
    );
  });
});
