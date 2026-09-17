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
 *   3. The pre-existing CO-only confirmBulk action (buildInOutActions) is
 *      untouched — it is unrelated to Reactivate and must keep excluding RE.
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

  it('still imports buildInOutActions from BulkDocumentAction (unrelated confirmBulk action)', () => {
    assert.match(
      src,
      /import\s+BulkDocumentAction\s*,\s*\{\s*buildInOutActions\s*\}\s+from\s+'@\/components\/contract-ui\/BulkDocumentAction'/,
      'buildInOutActions must still be imported alongside BulkDocumentAction',
    );
  });

  it('still wires buildActions={buildInOutActions} to the existing confirm-only BulkDocumentAction', () => {
    assert.match(
      src,
      /buildActions=\{buildInOutActions\}/,
      'The pre-existing CO-only bulk action must keep receiving buildInOutActions via the buildActions prop',
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
