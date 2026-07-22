import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ETP-4567 regression coverage.
//
// Bug 1: `entities.lines.fields.<quantityField>` and `entities.lines.fields.listPrice`
// carry `"min": 0` in decisions.json, which blocks negative values (returns,
// credit adjustments, negative price-list corrections) on document lines.
//
// Bug 2: the `listPrice` field (AD column `PriceList`) must resolve to the
// Spanish label "Precio" via `window.labelOverrides.es_ES.PriceList`, not the
// AD default ("Precio tarifa").
//
// Both are pure decisions.json content issues — the generic min/label
// resolution logic in DataTable.jsx / InlineLinesPanel.jsx / useLabel() is
// already correct and covered elsewhere. This test only asserts on the
// decisions.json source of truth (not the generated contract.json), across
// the 5 affected windows.
//
// NOTE: `discount` / `etgoDiscount` also carries `min: 0` in these same
// entities — that is intentionally out of scope for ETP-4567 and must NOT be
// touched by this test or its fix.

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsRoot = join(__dirname, '..');

const WINDOWS = [
  { name: 'sales-order', entity: 'lines', quantityField: 'orderedQuantity' },
  { name: 'purchase-order', entity: 'lines', quantityField: 'orderedQuantity' },
  { name: 'sales-invoice', entity: 'lines', quantityField: 'invoicedQuantity' },
  { name: 'purchase-invoice', entity: 'lines', quantityField: 'invoicedQuantity' },
  { name: 'sales-quotation', entity: 'lines', quantityField: 'orderedQuantity' },
];

function readDecisions(windowName) {
  const filePath = join(artifactsRoot, windowName, 'decisions.json');
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

describe('ETP-4567: negative quantity/price allowed + listPrice Spanish label (decisions.json)', () => {
  for (const { name, entity, quantityField } of WINDOWS) {
    describe(name, () => {
      const decisions = readDecisions(name);
      const fields = decisions.entities?.[entity]?.fields ?? {};

      it(`${quantityField} allows negative values (no min: 0 lock)`, () => {
        const field = fields[quantityField];
        assert.ok(field, `${quantityField} must exist in entities.${entity}.fields`);
        assert.notEqual(
          field.min,
          0,
          `entities.${entity}.fields.${quantityField}.min must not be 0 — ` +
            'negative quantities (returns/credit adjustments) must be allowed',
        );
      });

      it('listPrice allows negative values (no min: 0 lock)', () => {
        const field = fields.listPrice;
        assert.ok(field, `listPrice must exist in entities.${entity}.fields`);
        assert.notEqual(
          field.min,
          0,
          `entities.${entity}.fields.listPrice.min must not be 0 — ` +
            'negative price-list amounts must be allowed',
        );
      });

      it('window.labelOverrides.es_ES.PriceList resolves to "Precio"', () => {
        const priceListLabel = decisions.window?.labelOverrides?.es_ES?.PriceList;
        assert.equal(
          priceListLabel,
          'Precio',
          'window.labelOverrides.es_ES.PriceList must be "Precio" ' +
            '(not the AD default "Precio tarifa")',
        );
      });
    });
  }
});
