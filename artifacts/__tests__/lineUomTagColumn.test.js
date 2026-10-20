// @covers artifacts/sales-quotation/decisions.json
// @covers artifacts/sales-order/decisions.json
// @covers artifacts/goods-shipment/decisions.json
// @covers artifacts/sales-invoice/decisions.json
// @covers artifacts/purchase-order/decisions.json
// @covers artifacts/goods-receipt/decisions.json
// @covers artifacts/purchase-invoice/decisions.json
// @covers artifacts/physical-inventory/decisions.json
// @covers artifacts/goods-movements/decisions.json
// @covers artifacts/internal-consumption/decisions.json
// @covers artifacts/return-to-vendor-shipment/decisions.json
// @covers artifacts/return-material-receipt/decisions.json
//
// Policy guardrail: every document line grid shows the line's unit of measure as a neutral grey
// pill (`display: 'tag'`) right after the quantity column. Declared in decisions.json, so a
// regeneration keeps it; the generated line table is checked against that declaration.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// window -> quantity column the unit must directly follow (physical-inventory counts, not books)
const WINDOWS = {
  'sales-quotation': 'orderedQuantity',
  'sales-order': 'orderedQuantity',
  'goods-shipment': 'movementQuantity',
  'sales-invoice': 'invoicedQuantity',
  'purchase-order': 'orderedQuantity',
  'goods-receipt': 'movementQuantity',
  'purchase-invoice': 'invoicedQuantity',
  'physical-inventory': 'quantityCount',
  'goods-movements': 'movementQuantity',
  'internal-consumption': 'movementQuantity',
  'return-to-vendor-shipment': 'movementQuantity',
  'return-material-receipt': 'movementQuantity',
};

const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// The live line table is the one the exported page wires as `DetailTable` (a window directory can
// keep stale tables from an older entity name, which must not satisfy the guard).
function liveLineTable(win) {
  const dir = `${win}/generated/web/${win}`;
  const pageName = read(`${dir}/index.jsx`).match(/from '\.\/([A-Za-z]+Page)'/)?.[1];
  assert.ok(pageName, `${win}: index.jsx must import a *Page`);
  const page = read(`${dir}/${pageName}.jsx`);
  const tables = [...page.matchAll(/DetailTable=\{([A-Za-z]+)\}/g)].map((m) => m[1]);
  const lines = tables.filter((t) => /Line/.test(t) && !/Tax/.test(t));
  assert.ok(lines.length > 0, `${win}: ${pageName} must wire a lines DetailTable`);
  return lines.map((name) => ({ name, src: read(`${dir}/${name}.jsx`) }));
}

function columnKeys(src) {
  const block = src.match(/sf-generated-start columns:[\s\S]*?sf-generated-end columns:/)?.[0] ?? '';
  return [...block.matchAll(/\{\s*key: '([A-Za-z]+)'/g)].map((m) => m[1]);
}

describe('document line grids show the unit of measure as a neutral pill', () => {
  for (const [win, qtyKey] of Object.entries(WINDOWS)) {
    describe(win, () => {
      const decisions = JSON.parse(read(`${win}/decisions.json`));

      it('decisions: uOM is a read-only grid column with display "tag"', () => {
        const uom = decisions.entities.lines.fields.uOM;
        assert.equal(uom.visibility, 'readOnly');
        assert.equal(uom.grid, true);
        assert.equal(uom.gridReadOnly, true);
        assert.equal(uom.display, 'tag');
      });

      it('decisions: labelOverrides name C_UOM_ID Unidad / Unit', () => {
        const overrides = decisions.window.labelOverrides;
        assert.equal(overrides.es_ES.C_UOM_ID, 'Unidad');
        assert.equal(overrides.en_US.C_UOM_ID, 'Unit');
      });

      it('generated line table: uOM sits immediately after the quantity column', () => {
        for (const { name, src } of liveLineTable(win)) {
          const keys = columnKeys(src);
          const q = keys.indexOf(qtyKey);
          assert.ok(q >= 0, `${name} has no ${qtyKey} column (${keys.join(', ')})`);
          assert.equal(keys[q + 1], 'uOM', `${name}: expected uOM right after ${qtyKey}, got ${keys.join(', ')}`);
          if (win === 'physical-inventory') assert.equal(keys[q + 2], 'etgoQtydiff');
        }
      });

      it('generated line table: the uOM column carries display "tag" and readOnly', () => {
        for (const { name, src } of liveLineTable(win)) {
          const line = src.split('\n').find((l) => /\{\s*key: 'uOM'/.test(l));
          assert.ok(line, `${name} has no uOM column`);
          assert.match(line, /display: 'tag'/);
          assert.match(line, /readOnly: true/);
        }
      });
    });
  }
});
