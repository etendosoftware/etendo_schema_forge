// @covers artifacts/product/decisions.json
// @covers artifacts/product-category/decisions.json
// @covers artifacts/physical-inventory/decisions.json
// @covers artifacts/goods-movements/decisions.json
// @covers artifacts/internal-consumption/decisions.json
// @covers artifacts/warehouse/decisions.json
// @covers tools/app-shell/src/windows/custom/warehouse/index.jsx
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ETP-5603 — the Inventory list toolbars are 56px (8px padding around 40px controls) because
// they inherit the generic ListView defaults (`listbarPaddingX/Y`). A window that re-declares
// those props would diverge silently the day the default moves, so none of the six may.
const REPO_ROOT = resolve(__dirname, '../../../../../..');
const INVENTORY_WINDOWS = [
  'product',
  'product-category',
  'physical-inventory',
  'goods-movements',
  'internal-consumption',
  'warehouse',
];
const OVERRIDES = ['listbarPaddingX', 'listbarPaddingY'];

const read = (relativePath) => readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');

describe('Inventory list toolbars inherit the generic ListView padding', () => {
  it.each(INVENTORY_WINDOWS)('%s declares no list toolbar padding override in decisions.json', (spec) => {
    const decisions = JSON.parse(read(`artifacts/${spec}/decisions.json`));
    const serialized = JSON.stringify(decisions);
    for (const key of OVERRIDES) {
      expect(serialized).not.toContain(`"${key}"`);
    }
  });

  it.each(INVENTORY_WINDOWS)('%s generated page passes no list toolbar padding override', (spec) => {
    const dir = `artifacts/${spec}/generated/web/${spec}`;
    const pages = readdirPages(dir);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const source = read(`${dir}/${page}`);
      for (const key of OVERRIDES) {
        expect(source, `${dir}/${page} must not pass ${key}`).not.toContain(key);
      }
    }
  });

  it('warehouse custom wrapper does not re-declare the list toolbar padding', () => {
    const source = read('tools/app-shell/src/windows/custom/warehouse/index.jsx');
    for (const key of OVERRIDES) {
      expect(source).not.toContain(key);
    }
  });
});

function readdirPages(dir) {
  // Only the window's top-level *Page.jsx renders <ListView>; the other generated files
  // (tables, forms) do not take the toolbar props.
  return readdirSync(resolve(REPO_ROOT, dir)).filter((name) => /Page\.jsx$/.test(name));
}
