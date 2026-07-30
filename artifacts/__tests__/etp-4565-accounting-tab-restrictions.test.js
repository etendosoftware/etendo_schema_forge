import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ETP-4565 regression coverage.
//
// The "Contabilidad" (Accounting) tab on 8 master-data windows must:
//   (a) never allow deleting its record — enforced via `entities.<name>.hideDelete: true`,
//       which drives `apiPrediction.crud.<entity>.delete: false` in contract.json and gates
//       the delete affordance in `DetailView.jsx` for both the detailEntity and secondaryTabs
//       patterns (see docs/decisions-reference.md, `hideDelete` entries).
//   (b) admit at most one record — enforced via `window.maxDetailLines: 1`, which caps
//       `addLineGuard` for the window's primary `detailEntity` (see docs/ui-customization.md
//       §11, `window.maxDetailLines`). This only applies to windows using the detailEntity
//       pattern; `secondaryTabs`-based accounting entities have no row-count cap and rely on
//       `hideDelete` alone plus the (already-1:1) business schema.
//
// `product-category` and `business-partner-category` already declare
// `window.maxDetailLines: 1` (see docs/ui-customization.md real-examples list) — this test does
// NOT re-assert that for them, only the still-missing `entities.accounting.hideDelete`.
//
// `tax` already declares `window.hideDelete` + `window.hideDeleteButton` (ETP-4464) but is
// missing both `window.maxDetailLines: 1` (it uses `window.detailEntity: "accounting"`) and the
// entity-level `entities.accounting.hideDelete: true` (defense-in-depth, matching the ETP-4464
// paired-flags style already used at the window level).
//
// `contacts` has two accounting tabs (`customerAccounting` / `vendorAccounting`), not one unified
// `accounting` entity — both must carry `hideDelete: true`.
//
// This test only asserts on the decisions.json source of truth (not the generated contract.json).

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsRoot = join(__dirname, '..');

function readDecisions(windowName) {
  const filePath = join(artifactsRoot, windowName, 'decisions.json');
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

// Windows whose accounting entity is a single `entities.accounting` block.
const HIDE_DELETE_ACCOUNTING_WINDOWS = [
  'product',
  'product-category',
  'business-partner-category',
  'asset-group',
  'tax',
];

// Windows with multiple accounting-style entities, each needing its own `hideDelete`.
const HIDE_DELETE_MULTI_ENTITY_WINDOWS = [
  { name: 'contacts', entities: ['customerAccounting', 'vendorAccounting'] },
];

// Windows whose accounting tab must be capped at exactly one record via
// `window.maxDetailLines: 1` (only applies to the `window.detailEntity` pattern).
const MAX_DETAIL_LINES_WINDOWS = ['tax'];

describe('ETP-4565: Contabilidad (Accounting) tab restrictions on master-data windows', () => {
  describe('entities.accounting.hideDelete (single accounting entity per window)', () => {
    for (const name of HIDE_DELETE_ACCOUNTING_WINDOWS) {
      it(`${name}: entities.accounting.hideDelete must be true`, () => {
        const decisions = readDecisions(name);
        const accounting = decisions.entities?.accounting;
        assert.ok(
          accounting,
          `ETP-4565: entities.accounting must exist in artifacts/${name}/decisions.json`,
        );
        assert.equal(
          accounting.hideDelete,
          true,
          `ETP-4565: artifacts/${name}/decisions.json → entities.accounting.hideDelete must be ` +
            'true — the Contabilidad tab record must never be deletable',
        );
      });
    }
  });

  describe('entities.<accountingTab>.hideDelete (multiple accounting entities per window)', () => {
    for (const { name, entities } of HIDE_DELETE_MULTI_ENTITY_WINDOWS) {
      for (const entityName of entities) {
        it(`${name}: entities.${entityName}.hideDelete must be true`, () => {
          const decisions = readDecisions(name);
          const entity = decisions.entities?.[entityName];
          assert.ok(
            entity,
            `ETP-4565: entities.${entityName} must exist in artifacts/${name}/decisions.json`,
          );
          assert.equal(
            entity.hideDelete,
            true,
            `ETP-4565: artifacts/${name}/decisions.json → entities.${entityName}.hideDelete must ` +
              'be true — the Contabilidad tab record must never be deletable',
          );
        });
      }
    }
  });

  describe('window.maxDetailLines caps the accounting tab at one record', () => {
    for (const name of MAX_DETAIL_LINES_WINDOWS) {
      it(`${name}: window.maxDetailLines must be 1`, () => {
        const decisions = readDecisions(name);
        assert.equal(
          decisions.window?.maxDetailLines,
          1,
          `ETP-4565: artifacts/${name}/decisions.json → window.maxDetailLines must be 1 — ` +
            'the Contabilidad tab (window.detailEntity: "accounting") must admit at most one record',
        );
      });
    }
  });
});
