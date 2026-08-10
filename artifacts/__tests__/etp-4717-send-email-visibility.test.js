import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ETP-4717 (Pair 2 — P2/P3) regression coverage.
//
// The "Enviar" (Send) row quick-action on 5 document windows (Sales Order,
// Purchase Order, Sales Invoice, Goods Shipment, Sales Quotation) currently has
// NO status gate at all in the Grid view: `RowQuickActions.jsx` already supports
// a declarative `actionsConfig.email.visibleWhen` predicate (see
// docs/decisions-reference.md § Row Quick Actions,
// docs/ui-customization.md § 13 `window.rowQuickActions`), sourced from
// `decisions.json → window.rowQuickActions.actions.email.visibleWhen` and copied
// verbatim into `contract.json → frontendContract.window.rowQuickActions.actions
// .email.visibleWhen` — but none of the 5 windows declare it yet, so the Grid
// shows "Enviar" on every row regardless of document status while the Form-view
// topbar (fixed in the same change) gates it to Completed (or, for Sales
// Quotation, non-Draft).
//
// This test asserts the target `visibleWhen` expression directly on each
// window's `contract.json` (the resolved artifact `RowQuickActions` actually
// reads at runtime), matching the Form-view rule so both codepaths agree:
//   - Sales Order, Purchase Order, Sales Invoice, Goods Shipment: visible only
//     when documentStatus === 'CO' ("Confirmado").
//   - Sales Quotation: visible whenever documentStatus !== 'DR' (i.e. "Bajo
//     evaluación" (UE) and any status after).

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsRoot = join(__dirname, '..');

function readContract(windowName) {
  const filePath = join(artifactsRoot, windowName, 'contract.json');
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function emailVisibleWhen(contract) {
  return contract.frontendContract?.window?.rowQuickActions?.actions?.email?.visibleWhen;
}

// Windows where "Enviar" must be gated to Completed (CO) only.
const CO_ONLY_WINDOWS = ['sales-order', 'purchase-order', 'sales-invoice', 'goods-shipment'];

describe('ETP-4717: row quick-action "Enviar" visibility gated by document status (contract.json)', () => {
  for (const name of CO_ONLY_WINDOWS) {
    it(`${name}: rowQuickActions.actions.email.visibleWhen must gate Send to Completed (CO) only`, () => {
      const contract = readContract(name);
      const visibleWhen = emailVisibleWhen(contract);
      assert.equal(
        visibleWhen,
        "@DocumentStatus@='CO'",
        `artifacts/${name}/contract.json → frontendContract.window.rowQuickActions.actions.email` +
          ".visibleWhen must be \"@DocumentStatus@='CO'\" — the grid row \"Enviar\" action must not " +
          'be visible while the document is still Draft (mirrors the Form-view Send gate)',
      );
    });
  }

  it(
    "sales-quotation: rowQuickActions.actions.email.visibleWhen must gate Send to non-Draft " +
      "(!='DR')",
    () => {
      const contract = readContract('sales-quotation');
      const visibleWhen = emailVisibleWhen(contract);
      assert.equal(
        visibleWhen,
        "@DocumentStatus@!='DR'",
        'artifacts/sales-quotation/contract.json → frontendContract.window.rowQuickActions.actions' +
          ".email.visibleWhen must be \"@DocumentStatus@!='DR'\" — Sales Quotation allows Send from " +
          "\"Bajo evaluación\" (UE) onward, unlike the other 4 windows which require CO",
      );
    },
  );
});
