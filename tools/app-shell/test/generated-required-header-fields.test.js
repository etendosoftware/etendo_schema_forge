// @covers artifacts/sales-order/generated/web/sales-order/HeaderPage.jsx
// @covers artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx
// @covers artifacts/purchase-order/generated/web/purchase-order/HeaderPage.jsx
// @covers artifacts/sales-quotation/generated/web/sales-quotation/QuotationPage.jsx
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generated-output guard — backend-computed totals never gate "+ Añadir líneas".
 *
 * DetailView shows the empty-state "+ Añadir líneas" only once every key of the
 * page's generated `requiredHeaderFields` has a value (`resolveCanAddLines`,
 * detailViewHelpers.jsx). On a NEW document `/defaults` answers the header totals
 * (`grandTotalAmount`, `summedLineAmount`) with null — the backend computes them
 * from the lines — so a total in that array keeps the button out of the empty
 * state until a manual save fills it. That is how the button disappeared from new
 * sales orders, sales invoices, purchase orders and quotations, and no test noticed
 * because every integration spec saved by hand first.
 *
 * Reads the generated `requiredHeaderFields` block (between its `@sf-generated`
 * markers) of each page and asserts the totals are absent. It deliberately does not
 * pin the whole array: adding or removing a legitimate required field must not fail
 * here. The behaviour itself is guarded by
 * e2e/tests/flows/platform/new-document-add-lines-gate.mocked.spec.js.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

const PAGES = [
  { window: 'sales-order', file: 'artifacts/sales-order/generated/web/sales-order/HeaderPage.jsx' },
  { window: 'sales-invoice', file: 'artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx' },
  { window: 'purchase-order', file: 'artifacts/purchase-order/generated/web/purchase-order/HeaderPage.jsx' },
  { window: 'sales-quotation', file: 'artifacts/sales-quotation/generated/web/sales-quotation/QuotationPage.jsx' },
];

const COMPUTED_TOTALS = ['grandTotalAmount', 'summedLineAmount'];

/** The keys of the generated `requiredHeaderFields` array, or null when the block is missing. */
function readRequiredHeaderFields(src) {
  const block = src.match(
    /@sf-generated-start requiredHeaderFields:[\w-]+\s*\n\s*const requiredHeaderFields = \[([^\]]*)\];/,
  );
  if (!block) return null;
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('generated requiredHeaderFields — computed totals never gate the add-lines action', () => {
  for (const { window, file } of PAGES) {
    describe(window, () => {
      const keys = readRequiredHeaderFields(readFileSync(join(REPO_ROOT, file), 'utf8'));

      it('emits a non-empty requiredHeaderFields block', () => {
        assert.ok(keys, `${file} has no generated requiredHeaderFields block`);
        assert.ok(keys.length > 0, `${file} emits an empty requiredHeaderFields array`);
      });

      it('leaves out the backend-computed header totals', () => {
        const gated = (keys ?? []).filter((key) => COMPUTED_TOTALS.includes(key));
        assert.deepEqual(gated, [],
          `${file} gates the add-lines action on ${gated.join(', ')} — /defaults returns them null on a new document`);
      });
    });
  }
});
